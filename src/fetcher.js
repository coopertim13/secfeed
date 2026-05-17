import Parser from 'rss-parser';

const parser = new Parser({ timeout: 10000 });

const RSS_FEEDS = [
  // News / editorial
  { name: 'The Hacker News',    url: 'https://feeds.feedburner.com/TheHackersNews' },
  { name: 'BleepingComputer',   url: 'https://www.bleepingcomputer.com/feed/' },
  { name: 'Dark Reading',       url: 'https://www.darkreading.com/rss.xml' },
  { name: 'SecurityWeek',       url: 'https://www.securityweek.com/feed/' },
  { name: 'Krebs on Security',  url: 'https://krebsonsecurity.com/feed/' },
  { name: 'Ars Technica Sec',   url: 'https://feeds.arstechnica.com/arstechnica/security' },
  { name: 'The Register Sec',   url: 'https://www.theregister.com/security/headlines.atom' },
  { name: 'SecurityAffairs',    url: 'https://securityaffairs.com/feed' },

  // Threat intelligence / research blogs
  { name: 'Talos Intelligence', url: 'https://blog.talosintelligence.com/feeds/posts/default' },
  { name: 'Unit 42',            url: 'https://unit42.paloaltonetworks.com/feed/' },
  { name: 'Securelist',         url: 'https://securelist.com/feed/' },
  { name: 'WeLiveSecurity',     url: 'https://www.welivesecurity.com/feed/' },
  { name: 'Rapid7 Blog',        url: 'https://www.rapid7.com/blog/feed/' },
  { name: 'Google Proj Zero',   url: 'https://googleprojectzero.blogspot.com/feeds/posts/default' },
  { name: 'Mandiant Blog',      url: 'https://www.mandiant.com/resources/blog/rss.xml' },
  { name: 'MSRC Blog',          url: 'https://msrc.microsoft.com/blog/feed/' },

  // Vulnerability / exploit feeds
  { name: 'SANS ISC',           url: 'https://isc.sans.edu/rssfeed_full.xml' },
  { name: 'Exploit-DB',         url: 'https://www.exploit-db.com/rss.xml' },
  { name: 'Full Disclosure',    url: 'https://seclists.org/rss/fulldisclosure.rss' },
  { name: 'ZDI',                url: 'https://www.zerodayinitiative.com/rss/published/' },
  { name: 'Packet Storm',       url: 'https://rss.packetstormsecurity.com/' },

  // Government / institutional
  { name: 'CISA Alerts',        url: 'https://www.cisa.gov/uscert/ncas/alerts.xml' },
  { name: 'CISA Activity',      url: 'https://www.cisa.gov/uscert/ncas/current-activity.xml' },
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
      const currentYear = new Date().getFullYear();
      for (const v of (data.vulnerabilities || []).slice(0, 10)) {
        const cve = v.cve;
        // Skip CVEs assigned more than 1 year ago — NVD publishes old records late
        // and CVE-2023-XXXXX being published today is rarely actionable news
        const cveYear = parseInt(cve.id.split('-')[1], 10);
        if (currentYear - cveYear > 1) {
          console.log(`[fetcher] Skipping old CVE ${cve.id} (assigned ${cveYear})`);
          continue;
        }
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

  // Red Hat Security Data — Critical CVEs made public in the last 24 hours
  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const resp = await fetch(
      `https://access.redhat.com/hydra/rest/securitydata/cve.json?severity=Critical&after=${yesterday}&per_page=10`
    );
    const cves = await resp.json();
    for (const cve of (cves || [])) {
      items.push({
        id: `redhat-${cve.CVE}`,
        title: `[Red Hat Critical] ${cve.CVE}`,
        description: (cve.bugzilla_description || cve.CVE).slice(0, 500),
        link: `https://access.redhat.com/security/cve/${cve.CVE}`,
        pubDate: cve.public_date,
        source: 'Red Hat Security',
      });
    }
  } catch (e) {
    console.warn(`[fetcher] Red Hat Security: ${e.message}`);
  }

  // MSRC Security Update Guide — latest Patch Tuesday CVEs (top 20 by severity)
  try {
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const resp = await fetch(
      `https://api.msrc.microsoft.com/cvrf/v2.0/cvrf/${monthStr}`,
      { headers: { Accept: 'application/json' } }
    );
    if (resp.ok) {
      const data = await resp.json();
      const vulns = data.Vulnerability || [];
      for (const v of vulns.slice(0, 20)) {
        const cveId = v.CVE || '';
        const title = v.Title?.Value || cveId;
        const score = v.CVSSScoreSets?.[0]?.BaseScore ?? '';
        const severity = v.CVSSScoreSets?.[0]?.Vector || '';
        if (!cveId) continue;
        items.push({
          id: `msrc-${cveId}`,
          title: `[MSRC${score ? ' ' + score : ''}] ${cveId}: ${title}`,
          description: `Microsoft severity: ${v.Severity?.Value || 'Unknown'}. ${severity}`.trim(),
          link: `https://msrc.microsoft.com/update-guide/vulnerability/${cveId}`,
          pubDate: now.toISOString(),
          source: 'MSRC',
        });
      }
    }
  } catch (e) {
    console.warn(`[fetcher] MSRC: ${e.message}`);
  }

  // OSV.dev — recent critical open-source vulnerabilities (last 24 hours)
  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const resp = await fetch('https://api.osv.dev/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { last_modified: { since: yesterday } } }),
    });
    const data = await resp.json();
    for (const v of (data.vulns || []).slice(0, 15)) {
      const severity = v.severity?.[0]?.score || '';
      const score = parseFloat(severity);
      if (score && score < 8.5) continue; // only high/critical
      const alias = v.aliases?.find(a => a.startsWith('CVE-')) || v.id;
      items.push({
        id: `osv-${v.id}`,
        title: `[OSV${score ? ' ' + score : ''}] ${alias}: ${v.summary || v.id}`,
        description: (v.details || v.summary || '').slice(0, 500),
        link: `https://osv.dev/vulnerability/${v.id}`,
        pubDate: v.modified || v.published,
        source: 'OSV.dev',
      });
    }
  } catch (e) {
    console.warn(`[fetcher] OSV.dev: ${e.message}`);
  }

  return items;
}
