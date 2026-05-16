import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fetchFeeds } from './fetcher.js';
import { triageItems } from './triage.js';
import { postToDiscord } from './discord.js';

const SEEN_FILE   = '.cache/seen-items.json';
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK;

function loadSeen() {
  if (existsSync(SEEN_FILE)) {
    try { return new Set(JSON.parse(readFileSync(SEEN_FILE, 'utf8'))); } catch {}
  }
  return new Set();
}

function saveSeen(seen) {
  mkdirSync('.cache', { recursive: true });
  const arr = [...seen].slice(-2000); // cap at 2k IDs
  writeFileSync(SEEN_FILE, JSON.stringify(arr));
}

async function main() {
  if (!WEBHOOK_URL) throw new Error('DISCORD_WEBHOOK env var is required');

  const seen = loadSeen();

  console.log('Fetching feeds...');
  const all = await fetchFeeds();
  console.log(`Fetched ${all.length} total items`);

  const fresh = all.filter(item => item.id && !seen.has(item.id));
  console.log(`${fresh.length} new items after deduplication`);

  // Mark everything seen regardless of whether we post
  for (const item of all) if (item.id) seen.add(item.id);

  if (fresh.length < 3) {
    console.log('Fewer than 3 new items — skipping digest (nothing novel)');
    saveSeen(seen);
    return;
  }

  console.log('Triaging...');
  const top5 = await triageItems(fresh);

  console.log('Posting to Discord...');
  await postToDiscord(WEBHOOK_URL, top5);

  saveSeen(seen);
  console.log('Done.');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
