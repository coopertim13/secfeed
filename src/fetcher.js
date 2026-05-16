import Parser from 'rss-parser';

const parser = new Parser({ timeout: 10000 });

const RSS_FEEDS = [
  { name: 'The Hacker News',  url: 'https://feeds.feedburner.com/TheHackersNews' },
  { name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/' },
  { name: 'SANS ISC',         url: 'https://isc.sans.edu/rssfeed_full.xml' },
  { name: 'SecurityWeek',     url: 'https://feeds.feedburner.com/securityweek' },
  { name: 'Exploit-DB',       url: 'https://www.exploit-db.com/rss.xml' },
  { name: 'Full Disclosure',  url: 'https://seclists.org/rss/fulldisclosure.rss' },
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

  // NVD — critical CVEs published in the last 6 hours
  try {
    const now = new Date();
    const sixHoursAgo = new Date(now - 6 * 60 * 60 * 1000);
    const fmt = d => d.toISOString().replace('.000Z', 'Z');
    const url =
      `https://services.nvd.nist.gov/rest/json/cves/2.0` +
      `?pubStartDate=${fmt(sixHoursAgo)}&pubEndDate=${fmt(now)}&cvssV3Severity=CRITICAL`;
    const resp = await fetch(url);
    const data = await resp.json();
    for (const v of (data.vulnerabilities || []).slice(0, 10)) {
      const cve = v.cve;
      const desc = cve.descriptions?.find(d => d.lang === 'en')?.value || '';
      items.push({
        id: cve.id,
        title: `[NVD CRITICAL] ${cve.id}`,
        description: desc.slice(0, 500),
        link: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
        pubDate: cve.published,
        source: 'NVD',
      });
    }
  } catch (e) {
    console.warn(`[fetcher] NVD: ${e.message}`);
  }

  return items;
}
