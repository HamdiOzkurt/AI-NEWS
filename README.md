# AI News Telegram Bot 📡

Bu proje; Gmail üzerinden gelen günlük yapay zeka haber bültenlerini okuyan, **OpenAI (GPT-4o)** modelinin gücünü kullanarak metni teknik ve rafine bir formata (hap bilgi) indirgeyen ve içerisindeki görselleri "Chain-of-Thought" yöntemiyle filtreleyerek sadece gerçek mimari/arayüz ekranlarını **Telegram Grubuna** otomatik raporlayan bir Node.js mikro servisidir.

## 🌟 Özellikler

- **Mail Dinleme:** Node-cron ve Gmail API entegrasyonu sayesinde belli bir göndericiden (örn: `therundown.ai`) gelen en yeni haberleri otomatik yakalar.
- **Akıllı Metin Özetleme (GPT-4o):** Gelen devasa uzunluktaki haber/bülten karmaşasını temizleyerek okuyucuyu yormayan, net bilgiler, parametreler ve teknoloji haberleri olarak formatlar.
- **Makine Öğrenmesi ile Görsel Filtreleme (Chain of Thought Analizi):** Haberlerdeki logoları, stok fotoğrafları, balina/robot illüstrasyonlarını tespit edip tamamen reddeder. Yalnızca **arayüz görüntülerini, benchmark tablolarını ve sistem grafiklerini** tespit ederek Telegrama iletir.
- **Telegram Entegrasyonu:** Formatlanmış makaleyi parçalayarak gönderir, onaylanmış görselleri doğru MIME (png/jpg/webp vb.) formatında cihazlarda bozulmadan tam ekran tıklanabilir halde ekler.
- **Otomasyon:** Her gün sabah 09:00'da veya manuel komutla çalışacak şekilde tasarlanmıştır.

## 🛠️ Kurulum Adımları

**1. Projeyi Klonlayın**
\`\`\`bash
git clone https://github.com/HamdiOzkurt/AI-NEWS.git
cd AI-NEWS
\`\`\`

**2. Bağımlılıkları Yükleyin**
\`\`\`bash
npm install
\`\`\`

**3. \`.env\` Dosyasını Ayarlayın**
Ana dizinde `.env` isimli bir dosya oluşturup aşağıdaki parametreleri doldurun:
\`\`\`env
# --- AI Ayarları ---
OPENAI_API_KEY=sk-proj-xxxxxxx
OPENAI_MODEL=gpt-4o

# --- Telegram Bot ---
TELEGRAM_BOT_TOKEN=xxxxxxxx:xxxxxxxxxxxxxxxx
TELEGRAM_CHAT_ID=-100xxxxxxxx

# --- Gmail Ayarları ---
GMAIL_SENDER_FILTER=therundown.ai

# --- Cron Ayarları ---
# Örn: Her gün 09:00 ve 12:00'da çalışsın
CRON_SCHEDULE=0 9,12 * * *
\`\`\`

*Not: Gmail OAuth2 Token'ının çalışması için Google Cloud Console üzerinden alınmış valid `credentials.json` dosyasını `config/` altına eklemeniz gerekebilir.*

**4. Başlatın**

Zamanlanmış (Cron) olarak arka planda çalıştırmak için:
\`\`\`bash
npm start
\`\`\`

Test ve anlık tetikleme (Cron'u beklemeden hemen çalıştırır) için:
\`\`\`bash
npm run now
\`\`\`

## 🏗️ Kullanılan Teknolojiler
- **Node.js**: Çekirdek çalışma ortamı ve API haberleşmesi.
- **node-telegram-bot-api**: Telegram mesaj yollama ve resim formatlama yönetim aracı.
- **OpenAI (GPT-4o)**: Görsel analiz (Vision), metin segmentasyonu, Düşünce Zinciri (CoT) formatlaması.
- **googleapis (Gmail)**: E-bülten yakalama arayüzü.
- **node-cron**: Otomatik görev zamanlayıcı.

## 📝 Gelecek Planlar
- Birden fazla bülten (Newsletter) kaynağından veri çekilmesi.
- Veritabanı entegrasyonu ile son yollanan haberlerin saklanıp tekrarların önlenmesi.
- Görsellere AI aracılığıyla OCR yapılıp içeriğin doğrudan aranabilir/çevrilebilir hale getirilmesi.
