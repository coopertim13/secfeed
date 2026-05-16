import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

export async function triageItems(items) {
  if (items.length === 0) return [];

  const digest = items
    .map((item, i) =>
      `[${i + 1}] Source: ${item.source}\nTitle: ${item.title}\n` +
      `Description: ${item.description.slice(0, 300)}\nURL: ${item.link}`
    )
    .join('\n\n---\n\n');

  const prompt =
    `You are a cybersecurity analyst. Review these security news items and select the TOP 5 ` +
    `most critical/impactful ones. Prioritize in this order:\n` +
    `1. Active 0-day exploitation or CISA KEV additions\n` +
    `2. ZDI advisories and GitHub Advisories (GHSA) for supply chain / open source RCE\n` +
    `3. Web app RCE, SQLi, auth bypass, XSS in widely-used software\n` +
    `4. Critical/High CVEs (CVSS ≥ 8.5) in common infrastructure or cloud services\n` +
    `5. Significant threat actor campaigns, novel malware, or novel attack techniques\n\n` +
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
    `Items:\n${digest}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  const top5 = JSON.parse(text);

  return top5.map(entry => ({
    ...items[entry.itemIndex - 1],
    rank: entry.rank,
    headline: entry.headline,
    why: entry.why,
    severity: entry.severity,
  }));
}
