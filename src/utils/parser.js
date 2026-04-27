import * as cheerio from 'cheerio';

/**
 * HTML mail içeriğini temiz, okunabilir düz metne dönüştürür.
 * Görselleri kaldırır (ayrı çıkarılır).
 * @param {string} html - Ham HTML içerik
 * @returns {string} Temizlenmiş düz metin
 */
export function parseHtmlToText(html) {
    if (!html) return '';

    const $ = cheerio.load(html);

    // Gereksiz elementleri kaldır (img hariç - ayrı işlenecek)
    $('style, script, head, meta, link, footer').remove();

    // Görselleri kaldır (ayrı extractImages ile çekilecek)
    $('img').remove();

    // Linkleri temizle ama metin kalsın
    $('a').each((_, el) => {
        const text = $(el).text().trim();
        const href = $(el).attr('href');
        if (text && href && !href.startsWith('mailto:')) {
            $(el).replaceWith(`${text} (${href})`);
        } else if (text) {
            $(el).replaceWith(text);
        }
    });

    // <br> ve blok elementleri yeni satıra dönüştür
    $('br').replaceWith('\n');
    $('p, div, tr, li, h1, h2, h3, h4, h5, h6').each((_, el) => {
        $(el).prepend('\n');
        $(el).append('\n');
    });

    // Düz metni al
    let text = $.text();

    // Birden fazla boş satırı teke indir
    text = text.replace(/\n{3,}/g, '\n\n');
    // Satır başı/sonu boşlukları temizle
    text = text.split('\n').map(line => line.trim()).join('\n');
    // Başlangıç/bitiş boşlukları
    text = text.trim();

    return text;
}

/**
 * HTML'den anlamlı görsel URL'lerini çıkarır.
 * Tracking pixel, ikon gibi küçük görselleri filtreler.
 * @param {string} html - Ham HTML içerik
 * @returns {Array<{src: string, alt: string}>} Görsel bilgileri
 */
export function extractImageUrls(html) {
    if (!html) return [];

    const $ = cheerio.load(html);
    const images = [];
    const seenUrls = new Set();

    $('img').each((_, el) => {
        const src = $(el).attr('src') || '';
        const alt = $(el).attr('alt') || '';
        const width = parseInt($(el).attr('width') || '0', 10);
        const height = parseInt($(el).attr('height') || '0', 10);

        // Filtreleme kuralları
        if (!src) return;
        if (seenUrls.has(src)) return; // duplikat

        // Tracking pixel ve küçük ikonları atla
        if ((width > 0 && width < 50) || (height > 0 && height < 50)) return;

        // Base64 data URI'ları atla (genelde küçük ikonlar)
        if (src.startsWith('data:')) return;

        // Tracking/analytics URL'leri atla
        const trackingPatterns = [
            'tracking', 'pixel', 'beacon', 'analytics',
            'open.gif', '1x1', 'spacer', 'blank.gif',
            'unsubscribe', 'mailchimp', 'list-manage'
        ];
        const srcLower = src.toLowerCase();
        if (trackingPatterns.some(p => srcLower.includes(p))) return;

        seenUrls.add(src);
        images.push({ src, alt });
    });

    return images;
}

/**
 * Base64 encoded mail body'sini decode eder.
 * @param {string} encoded - Base64url encoded string
 * @returns {string} Decoded string
 */
export function decodeBase64(encoded) {
    if (!encoded) return '';
    // Gmail base64url format: + → -, / → _
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Base64 encoded binary veriyi Buffer'a dönüştürür.
 * @param {string} encoded - Base64url encoded string
 * @returns {Buffer} Binary buffer
 */
export function decodeBase64ToBuffer(encoded) {
    if (!encoded) return Buffer.alloc(0);
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64');
}
