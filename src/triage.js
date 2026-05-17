import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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
    `1. Active 0-day exploitation or CISA KEV additions (always treat KEV additions as high priority — ` +
    `CISA adding a CVE to KEV means active exploitation is confirmed regardless of the CVE's age)\n` +
    `2. ZDI, MSRC, Red Hat, or OSV advisories for RCE / privilege escalation in widely-deployed software\n` +
    `3. GitHub Advisories (GHSA) for supply chain / open source RCE\n` +
    `4. Threat intel from Talos, Unit 42, Mandiant, Securelist — novel campaigns, malware, or TTPs\n` +
    `5. Web app RCE, SQLi, auth bypass, XSS in widely-used software\n` +
    `6. Critical/High CVEs (CVSS ≥ 8.5) in common infrastructure or cloud services\n\n` +
    `IMPORTANT — freshness: deprioritize or skip any NVD CVEs whose ID indicates they were assigned ` +
    `more than 1 year ago (e.g. CVE-2023-* items that have just now appeared in NVD). ` +
    `These are old vulnerabilities being documented late and are rarely actionable breaking news. ` +
    `Prefer freshly assigned CVEs, Patch Tuesday releases, and recently published advisories.\n\n` +
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

  const results = top5
    .map(entry => {
      const item = items[entry.itemIndex - 1];
      if (!item) {
        console.warn(`[triage] itemIndex ${entry.itemIndex} out of range (total: ${items.length}), skipping`);
        return null;
      }
      return { ...item, rank: entry.rank, headline: entry.headline, why: entry.why, severity: entry.severity };
    })
    .filter(Boolean);

  console.log(`[triage] ${results.length}/5 items resolved successfully`);
  return results;
}
