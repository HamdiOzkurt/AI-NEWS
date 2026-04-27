import OpenAI from 'openai';
import logger from '../utils/logger.js';
import { parseHtmlToText } from '../utils/parser.js';

const SUMMARY_PROMPT = `Sen deneyimli bir AI Haber Editörü ve Teknoloji Analistisin.
Amacın, ofisimizdeki ekibin gündemi hızlıca takip etmesi için AI bülteninden profesyonel, temiz ve okunması kolay bir Telegram özeti çıkarmak.

ÖZET KURALLARI:
1. En kritik 3-4 haberi seç.
2. Açıklamalar net, profesyonel ve bilgi odaklı olsun (Gereksiz uzun paragraflar yazma, her haber için kritik detayı 2-3 cümlede ver).
3. Okuyucuyu yormadan, olayın ne olduğunu ve teknolojide neyi değiştirdiğini vurgula.
4. Odaklanılacak konular: Yeni modeller, önemli güncellemeler, maliyet/hız odakları, donanım destekleri ve önemli açık kaynak projeleri.

GÖRSEL KURALLARI (ÇOK ÇOK ÖNEMLİ !!!):
- SADECE şu görseller "önemlidir": Ürün arayüzleri, kod ekranları, benchmark grafikleri, mimari diyagramlar.
- ASLA SEÇMEMEN GEREKENLER: 
  ❌ Bir modeli "temsil eden" herhangi bir hayvan (balina vb.), robot, uzaylı veya stok çizim.
  ❌ Haberin kapağı olarak tasarlanmış sanatsal illüstrasyonlar veya logolar.
Eğer emin değilsen, hiçbir görseli seçme. İllüstrasyonlar profesyonel bülten için ÇÖPTÜR. 

FORMAT (Telegram Markdown - AYNEN uygula):

AI GÜNLÜK RAPORU
Tarih: _[Gün Ay Yıl]_
━━━━━━━━━━━━━━━━

▪️ *[Haber Başlığı]*
[2-3 cümlelik net ve bilgilendirici özet. Olayın ne olduğunu ve sektördeki yerini kısaca anlat.]

▪️ *[Haber Başlığı]*
[2-3 cümlelik net ve bilgilendirici özet. Olayın ne olduğunu ve sektördeki yerini kısaca anlat.]

▪️ *[Haber Başlığı]*
[2-3 cümlelik net ve bilgilendirici özet. Olayın ne olduğunu ve sektördeki yerini kısaca anlat.]

━━━━━━━━━━━━━━━━
Günün Özeti: [1-2 cümlelik genel teknoloji trendi yorumu]
━━━━━━━━━━━━━━━━

FORMAT NOTLARI:
- Bold: *tek yıldız* (ASLA ** kullanma)
- Italic: _alt çizgi_
- Ciddi, şık bir bülten formatında olsun. Emoji kullanma (Sadece ▪️ ve grafikler/çekler hariç).`;

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
            text: `\nAşağıda bu haberlere ait ${images.length} adet görsel var. ` +
                `Tüm görselleri sırayla incele ve her biri için KESİN karar ver:\n` +
                `- ONAY: Yalnızca yazılım arayüzü (UI ekran görüntüsü), benchmark/performans grafiği veya kod/terminal çıktısı.\n` +
                `- RED: Bülten logosu/banner, stok fotoğraf, illüstrasyon, hayvan, robot veya soyut çizim.\n\n` +
                `Mesajının EN SONUNA, başka hiçbir metin eklemeden, TAM OLARAK şu bloğu yaz:\n` +
                `IMAGE_CAPTIONS:\n` +
                `1:: RED - [kısa sebep]\n` +
                `2:: KABUL - [görselin içeriği: hangi arayüz/grafik/metrik]\n` +
                `3:: RED - [kısa sebep]\n` +
                `(Her görsel için mutlaka bir satır olsun. Format dışına çıkma.)`
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

        // IMAGE_CAPTIONS KABUL/RED satırlarını çıkar ve parse et
        let relevantImagesWithCaptions = [];
        const captionsMatch = summary.match(/IMAGE[_\s]CAPTIONS\s*:\s*\n([\s\S]*)/i);
        if (captionsMatch) {
            const lines = captionsMatch[1].split('\n');
            for (const line of lines) {
                // Başta/sonda boşluk, :: veya : : veya — verimli eşleştir
                const m = line.trim().match(/^(\d+)\s*:{1,2}\s*KABUL\s*[-–:]\s*(.+)$/i);
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
            summary = summary.replace(/IMAGE[_\s]CAPTIONS\s*:[\s\S]*/i, '').trim();
        } else {
            logger.warn('IMAGE_CAPTIONS bloğu bulunamadı — model formatı tutmadı.');
        }

        logger.info(`AI özetleme tamamlandı. ${relevantImagesWithCaptions.length} geçerli önemli görsel tespit edildi.`);
        return { summary, relevantImagesWithCaptions };
    } catch (error) {
        logger.error(`OpenRouter API hatası: ${error.message}`);
        throw error;
    }
}

