# SecFeed

An automated cybersecurity intelligence feed that aggregates alerts from 14+ sources, uses Google Gemini AI to triage the top 5 most critical items, and posts a daily digest to Discord.

## What it does

SecFeed runs every 6 hours via GitHub Actions and:

1. **Fetches** from RSS feeds (The Hacker News, BleepingComputer, Krebs, SANS ISC, Exploit-DB, ZDI, Full Disclosure, CISA Alerts), the CISA Known Exploited Vulnerabilities API, NVD (CRITICAL/HIGH CVEs from the last 6 hours), and the GitHub Advisory Database
2. **Deduplicates** against a rolling cache of 2,000 previously seen items
3. **Triages** the new items with Gemini 2.5 Flash, prioritizing 0-days, supply chain RCE, high-CVSS CVEs, and novel attack techniques
4. **Posts** the top 5 to a Discord channel as a formatted embed with severity indicators and source links

If fewer than 3 new items are found, no digest is posted.

## Setup

### Prerequisites

- Node.js 20+
- A [Discord webhook URL](https://support.discord.com/hc/en-us/articles/228383668)
- A [Google Gemini API key](https://aistudio.google.com/app/apikey)

### Local

```bash
git clone https://github.com/coopertim13/secfeed.git
cd secfeed
npm install
```

Create a `.env` file in the project root:

```
DISCORD_WEBHOOK=https://discord.com/api/webhooks/...
GEMINI_API_KEY=your_gemini_api_key
```

Run the pipeline:

```bash
npm start
```

### GitHub Actions (recommended)

The workflow in [.github/workflows/security-feed.yml](.github/workflows/security-feed.yml) runs automatically every 6 hours (00:00, 06:00, 12:00, 18:00 UTC) and can also be triggered manually.

1. Fork or push the repo to GitHub
2. Go to **Settings → Secrets and variables → Actions** and add two repository secrets:
   - `DISCORD_WEBHOOK`
   - `GEMINI_API_KEY`
3. Enable GitHub Actions — the workflow will run on schedule automatically

The workflow caches `.cache/seen-items.json` between runs so deduplication persists across executions.

## Project structure

```
secfeed/
├── src/
│   ├── index.js      # Orchestrator — loads cache, runs pipeline, saves cache
│   ├── fetcher.js    # Aggregates from 14+ sources with timeout handling
│   ├── triage.js     # Sends items to Gemini; parses and validates response
│   └── discord.js    # Formats embeds and posts to Discord webhook
├── .cache/
│   └── seen-items.json   # Deduplication state (auto-managed)
├── .github/workflows/
│   └── security-feed.yml
└── package.json
```

## Configuration

Feed sources and triage behavior are configured directly in the source files:

- **Sources** — add or remove feeds in [src/fetcher.js](src/fetcher.js)
- **Triage prompt** — adjust prioritization criteria in [src/triage.js](src/triage.js)
- **Digest format** — change embed layout or severity colors in [src/discord.js](src/discord.js)
- **Schedule** — modify the cron expression in [.github/workflows/security-feed.yml](.github/workflows/security-feed.yml)

## Dependencies

- [`@google/generative-ai`](https://www.npmjs.com/package/@google/generative-ai) — Gemini API client
- [`rss-parser`](https://www.npmjs.com/package/rss-parser) — RSS/Atom feed parsing
