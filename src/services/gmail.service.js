import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import logger from '../utils/logger.js';
import { decodeBase64, decodeBase64ToBuffer, extractImageUrls } from '../utils/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const TOKEN_PATH = path.join(__dirname, '..', '..', 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, '..', 'config', 'credentials.json');

/**
 * OAuth2 client oluşturur ve yetkilendirme yapar.
 */
async function authorize() {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        throw new Error(
            `credentials.json bulunamadı!\n` +
            `Google Cloud Console'dan OAuth2 credentials indirip şuraya koy:\n` +
            `${CREDENTIALS_PATH}`
        );
    }

    const content = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
    const credentials = JSON.parse(content);

    const { client_secret, client_id, redirect_uris } =
        credentials.installed || credentials.web;

    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    if (fs.existsSync(TOKEN_PATH)) {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
        oAuth2Client.setCredentials(token);

        if (token.expiry_date && token.expiry_date < Date.now()) {
            logger.info('Token süresi dolmuş, yenileniyor...');
            try {
                const { credentials: newToken } = await oAuth2Client.refreshAccessToken();
                oAuth2Client.setCredentials(newToken);
                fs.writeFileSync(TOKEN_PATH, JSON.stringify(newToken, null, 2));
                logger.info('Token başarıyla yenilendi.');
            } catch (err) {
                logger.error(`Token yenileme hatası: ${err.message}`);
                fs.unlinkSync(TOKEN_PATH);
                return await getNewToken(oAuth2Client);
            }
        }

        return oAuth2Client;
    }

    return await getNewToken(oAuth2Client);
}

/**
 * Tarayıcıdan yetkilendirme yaparak yeni token alır.
 */
async function getNewToken(oAuth2Client) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });

    logger.info('='.repeat(60));
    logger.info('Gmail yetkilendirmesi gerekiyor!');
    logger.info('Aşağıdaki URL\'yi tarayıcıda aç ve yetkilendirme yap:');
    console.log(`\n🔗 ${authUrl}\n`);
    logger.info('='.repeat(60));

    const code = await new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        rl.question('Yetkilendirme kodunu buraya yapıştır: ', (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });

    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    logger.info('Token başarıyla kaydedildi: ' + TOKEN_PATH);

    return oAuth2Client;
}

/**
 * URL'den görseli indirir ve Buffer olarak döndürür.
 * @param {string} url - Görsel URL'si
 * @returns {Promise<{buffer: Buffer, mimeType: string} | null>}
 */
async function downloadImage(url) {
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(10000) // 10 saniye timeout
        });

        if (!response.ok) return null;

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Çok küçük görselleri atla (< 2KB = muhtemelen tracking pixel)
        if (buffer.length < 2048) return null;

        // Çok büyük görselleri atla (> 5MB)
        if (buffer.length > 5 * 1024 * 1024) {
            logger.warn(`Görsel çok büyük, atlanıyor: ${url} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);
            return null;
        }

        return { buffer, mimeType: contentType.split(';')[0].trim() };
    } catch (err) {
        logger.warn(`Görsel indirilemedi: ${url} - ${err.message}`);
        return null;
    }
}

/**
 * Mail'deki inline (CID) görselleri çıkarır.
 * @param {Array} parts - Mail payload parts
 * @param {object} gmail - Gmail API instance
 * @param {string} messageId - Mail ID
 * @returns {Promise<Array<{buffer: Buffer, mimeType: string, filename: string}>>}
 */
async function extractInlineImages(parts, gmail, messageId) {
    const images = [];
    if (!parts) return images;

    for (const part of parts) {
        if (part.parts) {
            const nested = await extractInlineImages(part.parts, gmail, messageId);
            images.push(...nested);
        }

        if (part.mimeType?.startsWith('image/') && part.body?.attachmentId) {
            try {
                const attachment = await gmail.users.messages.attachments.get({
                    userId: 'me',
                    messageId: messageId,
                    id: part.body.attachmentId,
                });

                const buffer = decodeBase64ToBuffer(attachment.data.data);

                // Küçük görselleri atla
                if (buffer.length < 2048) continue;

                images.push({
                    buffer,
                    mimeType: part.mimeType,
                    filename: part.filename || `image_${images.length}.${part.mimeType.split('/')[1]}`
                });
            } catch (err) {
                logger.warn(`Inline görsel alınamadı: ${err.message}`);
            }
        }
    }

    return images;
}

/**
 * Bugünün tarihinde, belirtilen gönderenden gelen en son maili bulur.
 * @param {string} senderFilter - Gönderen e-posta adresi
 * @returns {Promise<{subject: string, body: string, date: string, images: Array} | null>}
 */
export async function fetchLatestNewsMail(senderFilter) {
    const auth = await authorize();
    const gmail = google.gmail({ version: 'v1', auth });

    const today = new Date();
    const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}/${String(yesterday.getMonth() + 1).padStart(2, '0')}/${String(yesterday.getDate()).padStart(2, '0')}`;

    let query = `from:${senderFilter} after:${yesterdayStr}`;
    logger.info(`Gmail sorgusu: ${query}`);

    const res = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 1,
    });

    if (!res.data.messages || res.data.messages.length === 0) {
        logger.warn(`Bugün (${dateStr}) ${senderFilter} adresinden mail bulunamadı.`);

        const threeDaysAgo = new Date(today);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const threeDaysAgoStr = `${threeDaysAgo.getFullYear()}/${String(threeDaysAgo.getMonth() + 1).padStart(2, '0')}/${String(threeDaysAgo.getDate()).padStart(2, '0')}`;

        query = `from:${senderFilter} after:${threeDaysAgoStr}`;
        logger.info(`Son 3 gün deneniyor: ${query}`);

        const fallbackRes = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: 1,
        });

        if (!fallbackRes.data.messages || fallbackRes.data.messages.length === 0) {
            logger.warn('Son 3 gün içinde de mail bulunamadı.');
            return null;
        }

        return await getMailContent(gmail, fallbackRes.data.messages[0].id);
    }

    return await getMailContent(gmail, res.data.messages[0].id);
}

/**
 * Mail ID'sine göre mail içeriğini ve görsellerini alır.
 */
async function getMailContent(gmail, messageId) {
    const msg = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
    });

    const headers = msg.data.payload.headers;
    const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || 'Başlık yok';
    const date = headers.find(h => h.name.toLowerCase() === 'date')?.value || '';

    let body = '';
    const payload = msg.data.payload;

    if (payload.parts) {
        body = extractBody(payload.parts);
    } else if (payload.body && payload.body.data) {
        body = decodeBase64(payload.body.data);
    }

    // ===== GÖRSELLERİ ÇEK =====
    const images = [];

    // 1. HTML'den URL bazlı görselleri çıkar ve indir
    const imageUrls = extractImageUrls(body);
    logger.info(`Mail'de ${imageUrls.length} adet görsel URL'si bulundu.`);

    const MAX_IMAGES = 5; // En fazla 5 görsel
    let downloadCount = 0;

    for (const img of imageUrls) {
        if (downloadCount >= MAX_IMAGES) break;

        const downloaded = await downloadImage(img.src);
        if (downloaded) {
            images.push({
                buffer: downloaded.buffer,
                mimeType: downloaded.mimeType,
                alt: img.alt,
                source: 'url'
            });
            downloadCount++;
            logger.info(`Görsel indirildi: ${img.alt || img.src.substring(0, 60)}... (${(downloaded.buffer.length / 1024).toFixed(1)}KB)`);
        }
    }

    // 2. Inline (CID) görselleri çek
    if (payload.parts && downloadCount < MAX_IMAGES) {
        const inlineImages = await extractInlineImages(payload.parts, gmail, messageId);
        for (const inlineImg of inlineImages) {
            if (downloadCount >= MAX_IMAGES) break;
            images.push({
                ...inlineImg,
                alt: inlineImg.filename,
                source: 'inline'
            });
            downloadCount++;
            logger.info(`Inline görsel alındı: ${inlineImg.filename} (${(inlineImg.buffer.length / 1024).toFixed(1)}KB)`);
        }
    }

    logger.info(`Mail bulundu: "${subject}" (${date}) — ${images.length} görsel`);

    return { subject, body, date, images };
}

/**
 * Multipart mail'den body'yi çeker (HTML tercih edilir).
 */
function extractBody(parts) {
    let htmlBody = '';
    let textBody = '';

    for (const part of parts) {
        if (part.parts) {
            const nested = extractBody(part.parts);
            if (nested) return nested;
        }

        if (part.mimeType === 'text/html' && part.body?.data) {
            htmlBody = decodeBase64(part.body.data);
        } else if (part.mimeType === 'text/plain' && part.body?.data) {
            textBody = decodeBase64(part.body.data);
        }
    }

    return htmlBody || textBody;
}
