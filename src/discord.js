const COLORS = { CRITICAL: 0xff2020, HIGH: 0xff8800, MEDIUM: 0xffcc00 };
const EMOJI  = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡' };

export async function postToDiscord(webhookUrl, items) {
  const timestamp = new Date().toUTCString();

  const embeds = items.map(item => {
    const embed = {
      title: `${EMOJI[item.severity] ?? '⚪'} #${item.rank} ${item.headline}`,
      description: `${item.why}\n\n[Read more](${item.link || '#'})`,
      color: COLORS[item.severity] ?? 0x888888,
      footer: { text: `${item.source ?? 'Unknown'} • ${item.pubDate ? new Date(item.pubDate).toUTCString() : 'Unknown date'}` },
    };
    if (item.link) embed.url = item.link;
    return embed;
  });

  const payload = {
    username: 'SecFeed',
    content: `**Security Digest** — Top 5 alerts as of ${timestamp}`,
    embeds,
  };

  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Discord webhook error ${resp.status}: ${body}`);
  }
}
