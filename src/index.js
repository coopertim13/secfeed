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

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const fresh = all.filter(item => {
    if (!item.id || seen.has(item.id)) return false;
    const pub = new Date(item.pubDate);
    return !isNaN(pub.getTime()) && pub >= cutoff;
  });
  console.log(`${fresh.length} new items after deduplication and date filter (cutoff: ${cutoff.toISOString()})`);

  if (fresh.length === 0) {
    console.log('No new items — skipping digest');
    saveSeen(seen);
    return;
  }

  console.log('Triaging...');
  const top5 = await triageItems(fresh);

  console.log('Posting to Discord...');
  await postToDiscord(WEBHOOK_URL, top5);

  // Only mark posted items as seen so unselected items can be reconsidered next run.
  // The 48-hour date filter is what clears out stale items, not the seen cache.
  for (const item of top5) if (item.id) seen.add(item.id);
  saveSeen(seen);
  console.log('Done.');
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
