import OpenAI from 'openai';
import logger from '../utils/logger.js';
import { parseHtmlToText } from '../utils/parser.js';

const SUMMARY_PROMPT = `Sen, deneyimli bir AI Research Engineer ve Technical Lead'sin. Teknik ekibe her sabah yüksek kaliteli, gürültüsüz AI özetleri hazırlıyorsun.

Görev: The Rundown AI tarzı günlük newsletter'ları teknik ekip için kısa, net, yüksek sinyal oranlı ve profesyonel Türkçe bir teknik rapora dönüştürmek.

KURALLAR:
- Sadece gerçekten teknik değeri yüksek gelişmeleri dahil et: yeni modeller, önemli benchmark sonuçları, mimari değişiklikler, performans/maliyet iyileştirmeleri, kritik açık kaynak release'leri ve önemli politika/anlaşma değişiklikleri.
- Hype kelimeleri, pazarlama dili, spekülasyon ve gereksiz yorumları tamamen çıkar.
- Her haber somut bilgi içermeli (model adı, parametre, benchmark değeri, yeni yetenek vb.).
- Toplam özet genellikle 4-6 haber arasında olsun. Düşük değerli haberleri atla.
- Dil ciddi, profesyonel ve akıcı Türkçe olsun.

GÖRSEL FİLTRELEME KURALLARI (ÇOK KRİTİK):
KABUL edilecek görseller:
- Gerçek UI screenshot'ları (yeni özellik gösteren)
- Benchmark grafikleri, tabloları ve eğitim eğrileri
- Model mimarisi diyagramları ve teknik flowchart'lar
- Kod snippet'leri, terminal çıktıları, API örnekleri

REDDEDİLECEKLER görseller:
- Dekoratif/sanatsal illüstrasyonlar, stok fotoğraflar
- İnsan, hayvan, robot, avatar içeren her türlü görsel
- Banner, logo, başlık ve marketing görselleri

Emin olmadığın hiçbir görseli KABUL etme.

ÇIKTI FORMATI (Tam olarak bu yapıyı kullan):

AI GÜNLÜK TEKNİK ÖZET
Tarih: _[Gün Ay Yıl]_

━━━━━━━━━━━━━━━━━━━━━━

▪️ *[Haber Başlığı - Kısa ve Teknik]*
• Net teknik özet (2-3 kısa cümle)
• 💡 *Önem:* Teknik ekip açısından önemi nedir?

▪️ *[Başka Bir Teknik Haber Başlığı]*
• Net teknik özet (2-3 kısa cümle)
• 💡 *Önem:* ...

━━━━━━━━━━━━━━━━━━━━━━

🔬 *Günün Teknik Takeaway’leri*
• Madde 1
• Madde 2
• Madde 3

━━━━━━━━━━━━━━━━━━━━━━

IMAGE_DECISION:
1:: KABUL - [Telegram için kısa görsel başlığı / Caption]
2:: RED
3:: RED
4:: KABUL - [Telegram için kısa görsel başlığı / Caption]`;

/**
 * Mail içeriğini OpenRouter AI ile özetler (metin + görseller).
 * @param {string} mailBody - Ham mail body (HTML veya düz metin)
 * @param {string} subject - Mail konusu
 * @param {string} date - Mail tarihi
 * @param {Array} images - Görsel buffer'ları [{buffer, mimeType, alt}]
 * @returns {Promise<{summary: string, relevantImageIndexes: number[]}>}
 */
export async function summarizeNews(mailBody, subject, date, images = []) {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey || apiKey === 'BURAYA_OPENAI_API_KEY_YAZIN') {
        throw new Error('OPENAI_API_KEY .env dosyasında ayarlanmamış!');
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const openai = new OpenAI({
        apiKey: apiKey,
    });

    // HTML ise düz metne çevir
    let cleanText = mailBody;
    if (mailBody.includes('<') && mailBody.includes('>')) {
        cleanText = parseHtmlToText(mailBody);
    }

    // Çok uzun metinleri kırp
    const MAX_CHARS = 30000;
    if (cleanText.length > MAX_CHARS) {
        cleanText = cleanText.substring(0, MAX_CHARS) + '\n\n[... içerik kırpıldı ...]';
        logger.warn(`Mail içeriği ${MAX_CHARS} karaktere kırpıldı.`);
    }

    // Mesaj içeriklerini hazırla
    const userContent = [];

    // 1. Mail metni
    const textMessage = `Konu: ${subject}\nTarih: ${date}\n\nİçerik:\n${cleanText}`;
    userContent.push({ type: 'text', text: textMessage });

    // 2. Görselleri ekle (varsa)
    if (images.length > 0) {
        userContent.push({
            type: 'text',
            text: `\nAşağıda bu haberlere ait ${images.length} adet görsel var.\n` +
                  `ÖNEMLİ GÖREV HATIRLATMASI:\n` +
                  `1. Yukarıdaki metin içeriğini analiz et ve sistem promptunda istenen "AI GÜNLÜK TEKNİK ÖZET" kısmını hazırla.\n` +
                  `2. Ardından görselleri incele ve "GÖRSEL FİLTRELEME KURALLARI"na göre karar vererek en sona "IMAGE_DECISION:" kısmını ekle.\n` +
                  `Lütfen her iki kısmı da (hem bülten özeti hem de görsel analizleri) eksiksiz olarak üret!`
        });

        for (let i = 0; i < images.length; i++) {
            const img = images[i];
            if (img.alt) {
                userContent.push({ type: 'text', text: `[Görsel ${i + 1}: ${img.alt}]` });
            }
            userContent.push({
                type: 'image_url',
                image_url: {
                    url: `data:${img.mimeType};base64,${img.buffer.toString('base64')}`
                }
            });
        }
    }

    logger.info(`OpenRouter API'ye gönderiliyor (model: ${model}, ${cleanText.length} karakter, ${images.length} görsel)...`);

    try {
        const completion = await openai.chat.completions.create({
            model: model,
            messages: [
                { role: 'system', content: SUMMARY_PROMPT },
                { role: 'user', content: userContent }
            ],
            max_tokens: 2000,
            temperature: 0.7,
        });

        let summary = completion.choices[0].message.content;

        // IMAGE_DECISION KABUL/RED satırlarını çıkar ve parse et
        let relevantImagesWithCaptions = [];
        const captionsMatch = summary.match(/IMAGE_DECISION:([\s\S]*)/);
        if (captionsMatch) {
            const lines = captionsMatch[1].split('\n');
            for (const line of lines) {
                // Sadece KABUL ile başlayanları al
                const m = line.match(/^(\d+)::\s*KABUL\s*-\s*(.+)$/i);
                if (m) {
                    const idx = parseInt(m[1], 10) - 1; // 1-based → 0-based
                    if (!isNaN(idx) && idx >= 0 && idx < images.length) {
                        relevantImagesWithCaptions.push({
                            index: idx,
                            caption: m[2].trim()
                        });
                    }
                }
            }
            summary = summary.replace(/IMAGE_DECISION:[\s\S]*/, '').trim();
        }

        // Eski format desteği (Eğer hiç KABUL yok ama eskiler kaldıysa iptal, sadece KABUL esastır)
        // relevantImagesWithCaptions fallback'ini kaldırıyoruz çünkü yeni sistem çok net.

        logger.info(`AI özetleme tamamlandı. ${relevantImagesWithCaptions.length} geçerli önemli görsel tespit edildi.`);
        return { summary, relevantImagesWithCaptions };
    } catch (error) {
        logger.error(`OpenRouter API hatası: ${error.message}`);
        throw error;
    }
}

