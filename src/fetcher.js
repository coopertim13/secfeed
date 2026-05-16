import Parser from 'rss-parser';

const parser = new Parser({ timeout: 10000 });

const RSS_FEEDS = [
  { name: 'The Hacker News',  url: 'https://feeds.feedburner.com/TheHackersNews' },
  { name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/' },
  { name: 'SANS ISC',         url: 'https://isc.sans.edu/rssfeed_full.xml' },
  { name: 'Exploit-DB',       url: 'https://www.exploit-db.com/rss.xml' },
  { name: 'Full Disclosure',  url: 'https://seclists.org/rss/fulldisclosure.rss' },
  { name: 'ZDI',              url: 'https://www.zerodayinitiative.com/rss/published/' },
  { name: 'Krebs on Security',url: 'https://krebsonsecurity.com/feed/' },
  { name: 'CISA Alerts',      url: 'https://www.cisa.gov/uscert/ncas/alerts.xml' },
];

export async function fetchFeeds() {
  const items = [];

  // RSS feeds
  for (const feed of RSS_FEEDS) {
    try {
      const result = await parser.parseURL(feed.url);
      for (const item of result.items.slice(0, 10)) {
        items.push({
          id: item.guid || item.link,
          title: item.title || '',
          description: (item.contentSnippet || item.content || item.summary || '').slice(0, 500),
          link: item.link || '',
          pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
          source: feed.name,
        });
      }
    } catch (e) {
      console.warn(`[fetcher] ${feed.name}: ${e.message}`);
    }
  }

  // CISA Known Exploited Vulnerabilities — only the 10 most recently added
  try {
    const resp = await fetch('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json');
    const data = await resp.json();
    const recent = data.vulnerabilities
      .sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded))
      .slice(0, 10);
    for (const v of recent) {
      items.push({
        id: v.cveID,
        title: `[CISA KEV] ${v.cveID}: ${v.vulnerabilityName}`,
        description: `${v.shortDescription} Product: ${v.product} by ${v.vendorProject}. Action: ${v.requiredAction}`,
        link: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
        pubDate: v.dateAdded,
        source: 'CISA KEV',
      });
    }
  } catch (e) {
    console.warn(`[fetcher] CISA KEV: ${e.message}`);
  }

  // NVD — CRITICAL and HIGH CVEs published in the last 6 hours
  for (const severity of ['CRITICAL', 'HIGH']) {
    try {
      const now = new Date();
      const sixHoursAgo = new Date(now - 6 * 60 * 60 * 1000);
      const fmt = d => d.toISOString().replace('.000Z', 'Z');
      const url =
        `https://services.nvd.nist.gov/rest/json/cves/2.0` +
        `?pubStartDate=${fmt(sixHoursAgo)}&pubEndDate=${fmt(now)}&cvssV3Severity=${severity}`;
      const resp = await fetch(url);
      const data = await resp.json();
      for (const v of (data.vulnerabilities || []).slice(0, 10)) {
        const cve = v.cve;
        const desc = cve.descriptions?.find(d => d.lang === 'en')?.value || '';
        const score = cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore
                   ?? cve.metrics?.cvssMetricV30?.[0]?.cvssData?.baseScore
                   ?? '';
        items.push({
          id: cve.id,
          title: `[NVD ${severity}${score ? ' ' + score : ''}] ${cve.id}`,
          description: desc.slice(0, 500),
          link: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
          pubDate: cve.published,
          source: `NVD ${severity}`,
        });
      }
    } catch (e) {
      console.warn(`[fetcher] NVD ${severity}: ${e.message}`);
    }
  }

  // GitHub Advisory Database — reviewed advisories, critical + high, most recent 20
  try {
    const resp = await fetch(
      'https://api.github.com/advisories?type=reviewed&per_page=20&sort=published&direction=desc',
      { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } }
    );
    const advisories = await resp.json();
    for (const adv of advisories) {
      if (!['critical', 'high'].includes(adv.severity)) continue;
      items.push({
        id: adv.ghsa_id,
        title: `[GHSA ${adv.severity.toUpperCase()}] ${adv.ghsa_id}: ${adv.summary}`,
        description: (adv.description || '').slice(0, 500),
        link: adv.html_url || `https://github.com/advisories/${adv.ghsa_id}`,
        pubDate: adv.published_at,
        source: 'GitHub Advisories',
      });
    }
  } catch (e) {
    console.warn(`[fetcher] GitHub Advisories: ${e.message}`);
  }

  return items;
}
