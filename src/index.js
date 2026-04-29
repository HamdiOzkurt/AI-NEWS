import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import { fetchLatestNewsMail } from './services/gmail.service.js';
import { summarizeNews } from './services/ai.service.js';
import { sendToTelegram, sendTestMessage } from './services/telegram.service.js';
import logger from './utils/logger.js';

// ============================================================
//  Ana Pipeline: Gmail → AI Özet → Telegram
// ============================================================

async function runPipeline() {
    const startTime = Date.now();

    try {
        logger.info('AI News pipeline başlatılıyor...');

        // 1. Gmail'den en son AI News mailini çek (görseller dahil)
        const senderFilter = process.env.GMAIL_SENDER_FILTER || 'newsletter@ainews.com';
        logger.info(`Mail çekiliyor (gönderen: ${senderFilter})...`);

        const mail = await fetchLatestNewsMail(senderFilter);

        if (!mail) {
            logger.warn('Mail bulunamadı, pipeline durduruluyor.');
            return;
        }

        // Mükerrer gönderimi önlemek için ID kontrolü
        const LAST_MAIL_ID_FILE = path.join(process.cwd(), 'last_mail_id.txt');
        if (fs.existsSync(LAST_MAIL_ID_FILE)) {
            const lastId = fs.readFileSync(LAST_MAIL_ID_FILE, 'utf8').trim();
            if (lastId === mail.id) {
                logger.info('Bu mail daha önce işlenmiş (ID aynı), atlanıyor.');
                return;
            }
        }

        logger.info(`Mail alındı: "${mail.subject}" — ${mail.images.length} görsel`);

        // 2. AI ile özetle (metin + görseller)
        logger.info('AI özetleme başlıyor...');
        const { summary, relevantImagesWithCaptions } = await summarizeNews(
            mail.body,
            mail.subject,
            mail.date,
            mail.images
        );
        logger.info(`Özetleme tamamlandı. ${relevantImagesWithCaptions.length} önemli görsel seçildi.`);

        // 3. Telegram'a gönder (metin özeti + önemli görseller)
        logger.info('Telegram\'a gönderiliyor...');
        await sendToTelegram(summary, mail.images, relevantImagesWithCaptions);
        logger.info('Telegram\'a başarıyla gönderildi!');

        // Başarılı gönderim sonrası ID'yi kaydet
        fs.writeFileSync(LAST_MAIL_ID_FILE, mail.id);
        logger.info(`İşlenen son mail ID'si kaydedildi: ${mail.id}`);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info(`Pipeline tamamlandı (${elapsed}s)`);

    } catch (error) {
        logger.error(`Pipeline hatası: ${error.message}`);
        logger.error(error.stack);

        try {
            await sendToTelegram(`*AI News Bot Hatasi*\n\n\`${error.message}\`\n\n_Lutfen loglari kontrol edin._`);
        } catch (telegramErr) {
            logger.error(`Telegram hata bildirimi de gönderilemedi: ${telegramErr.message}`);
        }
    }
}

// ============================================================
//  CLI Komutları
// ============================================================

const args = process.argv.slice(2);

if (args.includes('--now')) {
    logger.info('Manuel çalıştırma modu (--now)');
    runPipeline().then(() => process.exit(0)).catch(() => process.exit(1));

} else if (args.includes('--test-gmail')) {
    logger.info('Gmail test modu');
    (async () => {
        try {
            const senderFilter = process.env.GMAIL_SENDER_FILTER || 'newsletter@ainews.com';
            const mail = await fetchLatestNewsMail(senderFilter);
            if (mail) {
                console.log('\nMail başarıyla alındı!');
                console.log(`Konu: ${mail.subject}`);
                console.log(`Tarih: ${mail.date}`);
                console.log(`İçerik uzunluğu: ${mail.body.length} karakter`);
                console.log(`Görsel sayısı: ${mail.images.length}`);
                if (mail.images.length > 0) {
                    console.log('\nBulunan görseller:');
                    mail.images.forEach((img, i) => {
                        console.log(`  ${i + 1}. ${img.alt || 'İsimsiz'} (${(img.buffer.length / 1024).toFixed(1)}KB, ${img.mimeType}, ${img.source})`);
                    });
                }
                console.log(`\n--- İlk 500 karakter ---\n`);
                console.log(mail.body.substring(0, 500));
            } else {
                console.log('\nMail bulunamadı.');
            }
        } catch (err) {
            console.error(`\nGmail hatası: ${err.message}`);
        }
        process.exit(0);
    })();

} else if (args.includes('--test-ai')) {
    logger.info('AI test modu');
    (async () => {
        try {
            const testContent = `
        Today's AI News:
        1. OpenAI released GPT-5 with improved reasoning capabilities.
        2. Google DeepMind announced a breakthrough in protein folding.
        3. Meta open-sourced a new large language model.
        4. NVIDIA unveiled next-gen AI chips with 2x performance.
        5. EU passed new AI regulation framework.
      `;
            const { summary } = await summarizeNews(testContent, 'AI News Test', new Date().toISOString());
            console.log('\nAI özetleme başarılı!\n');
            console.log(summary);
        } catch (err) {
            console.error(`\nAI hatası: ${err.message}`);
        }
        process.exit(0);
    })();

} else if (args.includes('--test-telegram')) {
    logger.info('Telegram test modu');
    (async () => {
        try {
            await sendTestMessage();
            console.log('\nTelegram test mesajı gönderildi!');
        } catch (err) {
            console.error(`\nTelegram hatası: ${err.message}`);
        }
        process.exit(0);
    })();

} else {
    const schedule = process.env.CRON_SCHEDULE || '0 9-14 * * *';

    logger.info('═'.repeat(50));
    logger.info('AI News Telegram Bot başlatıldı!');
    logger.info(`Zamanlama: ${schedule}`);
    logger.info(`Gönderen filtresi: ${process.env.GMAIL_SENDER_FILTER || 'newsletter@ainews.com'}`);
    logger.info('Görsel desteği: Aktif');
    logger.info('═'.repeat(50));

    cron.schedule(schedule, () => {
        logger.info('Zamanlanan çalışma tetiklendi.');
        runPipeline();
    }, {
        timezone: 'Europe/Istanbul'
    });

    logger.info('İlk çalışma başlatılıyor...');
    runPipeline();
}
