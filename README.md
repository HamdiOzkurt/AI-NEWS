# AI News Telegram Bot

A Node.js service that reads daily AI newsletter emails via Gmail, summarizes them using **GPT-4o**, filters images with a Chain-of-Thought pipeline, and delivers clean reports to a **Telegram group** — automatically, every morning.

## Features

- **Gmail Integration** — Polls a specific sender (e.g. `therundown.ai`) via the Gmail API and fetches the latest newsletter on each run.
- **GPT-4o Summarization** — Strips noise from long newsletter HTML and produces a concise, structured summary: key headlines, model benchmarks, and technical takeaways.
- **Chain-of-Thought Image Filtering** — Each image in the email is evaluated by the model. Only screenshots of software UIs, benchmark charts, and code/terminal output are approved. Newsletter banners, stock photos, and decorative illustrations are discarded.
- **Telegram Delivery** — Sends the formatted summary in chunks (respecting Telegram's character limit) followed by the approved images, with correct MIME types so they render full-screen on mobile.
- **Scheduling** — Runs on a configurable cron schedule (default: 09:00 daily) or on-demand via a single command.

## Setup

**1. Clone the repository**
```bash
git clone https://github.com/HamdiOzkurt/AI-NEWS.git
cd AI-NEWS
```

**2. Install dependencies**
```bash
npm install
```

**3. Configure environment variables**

Create a `.env` file in the project root:
```env
# OpenAI
OPENAI_API_KEY=sk-proj-xxxxxxx
OPENAI_MODEL=gpt-4o

# Telegram
TELEGRAM_BOT_TOKEN=xxxxxxxx:xxxxxxxxxxxxxxxx
TELEGRAM_CHAT_ID=-100xxxxxxxx

# Gmail — sender domain to filter
GMAIL_SENDER_FILTER=therundown.ai

# Cron schedule (default: 09:00 and 12:00 every day)
CRON_SCHEDULE=0 9,12 * * *
```

**4. Add Gmail credentials**

Place your Google Cloud OAuth2 `credentials.json` file under `src/config/`. The bot will prompt you to authorize on first run and save the token automatically.

**5. Run**

Start the scheduler (runs in background on the cron schedule):
```bash
npm start
```

Trigger an immediate run without waiting for the schedule:
```bash
npm run now
```

## Tech Stack

| Package | Purpose |
|---|---|
| `openai` | GPT-4o text summarization and image analysis |
| `googleapis` | Gmail API — email fetching and OAuth2 |
| `node-telegram-bot-api` | Telegram message and media delivery |
| `node-cron` | Cron-based scheduling |

## Roadmap

- Support multiple newsletter sources in a single run
- Persist sent items to a database to prevent duplicate deliveries
- OCR on approved images to make content searchable
