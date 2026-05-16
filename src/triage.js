import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function triageItems(items) {
  if (items.length === 0) return [];

  const digest = items
    .map((item, i) =>
      `[${i + 1}] Source: ${item.source}\nTitle: ${item.title}\n` +
      `Description: ${item.description.slice(0, 300)}\nURL: ${item.link}`
    )
    .join('\n\n---\n\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content:
          `You are a cybersecurity analyst. Review these security news items and select the TOP 5 ` +
          `most critical/impactful ones. Prioritize in this order:\n` +
          `1. Active 0-day exploitation or CISA KEV additions\n` +
          `2. Web app RCE, SQLi, auth bypass in widely-used software\n` +
          `3. Critical-severity CVEs (CVSS ≥ 9.0) in common infrastructure\n` +
          `4. Significant threat actor campaigns or novel attack techniques\n\n` +
          `Return ONLY a JSON array of exactly 5 objects — no markdown, no explanation:\n` +
          `[\n` +
          `  {\n` +
          `    "rank": 1,\n` +
          `    "itemIndex": <1-based index from input>,\n` +
          `    "headline": "<20 word max punchy headline>",\n` +
          `    "why": "<1-2 sentences: what is affected and why it matters>",\n` +
          `    "severity": "CRITICAL" | "HIGH" | "MEDIUM"\n` +
          `  }\n` +
          `]\n\n` +
          `Items:\n${digest}`,
      },
    ],
  });

  const text = response.content[0].text.trim();
  const top5 = JSON.parse(text);

  return top5.map(entry => ({
    ...items[entry.itemIndex - 1],
    rank: entry.rank,
    headline: entry.headline,
    why: entry.why,
    severity: entry.severity,
  }));
}
