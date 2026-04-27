import TelegramBot from 'node-telegram-bot-api';
import logger from '../utils/logger.js';
import os from 'os';
import path from 'path';
import fs from 'fs';

let bot = null;

/**
 * Telegram bot instance'ını başlatır.
 */
function getBot() {
    if (!bot) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token || token === 'BURAYA_TELEGRAM_BOT_TOKEN_YAZIN') {
            throw new Error('TELEGRAM_BOT_TOKEN .env dosyasında ayarlanmamış!');
        }
        bot = new TelegramBot(token, { polling: false });
    }
    return bot;
}

/**
 * Telegram'a metin mesajı + ilgili görselleri gönderir.
 * Akış: Önce metin özeti, sonra önemli görseller ayrı fotoğraf olarak.
 *
 * @param {string} message - Gönderilecek mesaj (Markdown formatında)
 * @param {Array} images - Tüm görseller [{buffer, mimeType, alt}]
 * @param {Array} relevantImagesWithCaptions - AI'ın önemli bulduğu görseller [{index, caption}]
 * @returns {Promise<void>}
 */
export async function sendToTelegram(summary, images = [], relevantImagesWithCaptions = []) {
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!chatId || chatId === 'BURAYA_TELEGRAM_CHAT_ID_YAZIN') {
        throw new Error('TELEGRAM_CHAT_ID .env dosyasında ayarlanmamış!');
    }

    const telegramBot = getBot();

    // 1. Önce metin mesajını gönder
    const chunks = splitMessage(summary, 4000);
    for (const chunk of chunks) {
        await telegramBot.sendMessage(chatId, chunk, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        });
        await sleep(500);
    }

    // 2. Önemli görselleri gönder
    if (relevantImagesWithCaptions && relevantImagesWithCaptions.length > 0) {
        const relevantImages = relevantImagesWithCaptions
            .filter(item => item.index >= 0 && item.index < images.length)
            .map(item => {
                const img = images[item.index];
                if (img) {
                    img.ai_caption = item.caption;
                }
                return img;
            })
            .filter(img => img && img.buffer);

        if (relevantImages.length === 0) {
            logger.info('Gönderilecek önemli görsel bulunamadı.');
            return;
        }

        const getExt = (mime) => {
            if (mime.includes('png')) return 'png';
            if (mime.includes('gif')) return 'gif';
            if (mime.includes('webp')) return 'webp';
            return 'jpg';
        };

        const tempDir = os.tmpdir();

        for (let i = 0; i < relevantImages.length; i++) {
            const img = relevantImages[i];
            const ext = getExt(img.mimeType || 'image/jpeg');
            const tempFilePath = path.join(tempDir, `telegram_bot_${Date.now()}_${i}.${ext}`);

            let captionText = img.ai_caption || truncateCaption(img.alt, `Görsel ${i + 1}`);
            let caption = `▪️ ${captionText}`;
            if (i === 0 && relevantImages.length > 1) {
                caption = `▪️ *Haber Görselleri* (${relevantImages.length} adet)\n\n${captionText}`;
            }

            try {
                fs.writeFileSync(tempFilePath, img.buffer);

                await telegramBot.sendPhoto(chatId, fs.createReadStream(tempFilePath), {
                    caption,
                    parse_mode: 'Markdown'
                });

                await sleep(800);
            } catch (err) {
                logger.error(`Görsel gönderilirken hata: ${err.message}`);
            } finally {
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
            }
        }

        logger.info(`${relevantImages.length} görsel Telegram'a gönderildi.`);
    } else {
        logger.info('Gönderilecek önemli görsel yok (AI tarafından seçilmedi).');
    }
}

/**
 * Telegram'a test mesajı gönderir.
 */
export async function sendTestMessage() {
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const telegramBot = getBot();

    const testMsg =
        `*Test Mesaji*\n\n` +
        `AI News Telegram Bot basariyla calisiyor!\n\n` +
        `━━━━━━━━━━━━━━━━\n\n` +
        `Tarih: ${new Date().toLocaleDateString('tr-TR')}\n` +
        `Saat: ${new Date().toLocaleTimeString('tr-TR')}\n\n` +
        `━━━━━━━━━━━━━━━━\n\n` +
        `_Gorsel destegi aktif_`;

    await telegramBot.sendMessage(chatId, testMsg, { parse_mode: 'Markdown' });
    logger.info('Test mesajı başarıyla gönderildi.');
}

/**
 * Uzun mesajları satır bazında parçalar.
 */
function splitMessage(text, maxLength) {
    const chunks = [];
    const lines = text.split('\n');
    let currentChunk = '';

    for (const line of lines) {
        if ((currentChunk + '\n' + line).length > maxLength) {
            if (currentChunk) {
                chunks.push(currentChunk.trim());
            }
            currentChunk = line;
        } else {
            currentChunk += (currentChunk ? '\n' : '') + line;
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Uzun görsel caption'larını kırpar.
 * @param {string} alt - Orijinal alt text
 * @param {string} fallback - Alt text yoksa kullanılacak varsayılan
 * @returns {string}
 */
function truncateCaption(alt, fallback = 'Görsel') {
    if (!alt) return fallback;
    if (alt.length <= 80) return alt;
    return alt.substring(0, 77) + '...';
}

