/**
 * MailSuite — DNS Checker Service
 * Live DNS resolution for SPF, DKIM, DMARC, BIMI, MX, Blacklists
 */
const dns = require('dns').promises;

async function checkSpf(domain) {
  try {
    const records = await dns.resolveTxt(domain);
    for (const rec of records) {
      const txt = rec.join('');
      if (txt.startsWith('v=spf1')) return { status: 'valid', record: txt };
    }
    return { status: 'missing', record: null };
  } catch { return { status: 'missing', record: null }; }
}

async function checkDkim(domain, selector = 'mail') {
  try {
    const dkimDomain = `${selector}._domainkey.${domain}`;
    const records = await dns.resolveTxt(dkimDomain);
    for (const rec of records) {
      const txt = rec.join('');
      if (txt.includes('v=DKIM1') || txt.includes('k=rsa')) {
        return { status: 'valid', record: txt.substring(0, 120) + (txt.length > 120 ? '...' : ''), selector };
      }
    }
    return { status: 'missing', record: null, selector };
  } catch { return { status: 'missing', record: null, selector }; }
}

async function checkDmarc(domain) {
  try {
    const records = await dns.resolveTxt(`_dmarc.${domain}`);
    for (const rec of records) {
      const txt = rec.join('');
      if (txt.startsWith('v=DMARC1')) {
        let policy = 'none';
        if (txt.includes('p=reject')) policy = 'reject';
        else if (txt.includes('p=quarantine')) policy = 'quarantine';
        return { status: 'valid', record: txt, policy };
      }
    }
    return { status: 'missing', record: null, policy: null };
  } catch { return { status: 'missing', record: null, policy: null }; }
}

async function checkBimi(domain) {
  try {
    const records = await dns.resolveTxt(`default._bimi.${domain}`);
    for (const rec of records) {
      const txt = rec.join('');
      if (txt.startsWith('v=BIMI1')) return { status: 'valid', record: txt };
    }
    return { status: 'missing', record: null };
  } catch { return { status: 'missing', record: null }; }
}

async function checkMx(domain) {
  try {
    const records = await dns.resolveMx(domain);
    return { status: 'valid', records: records.map(r => ({ exchange: r.exchange, priority: r.priority })) };
  } catch { return { status: 'missing', records: [] }; }
}

async function checkBlacklists(domain) {
  const lists = [
    { name: 'Spamhaus ZEN', bl: 'zen.spamhaus.org' },
    { name: 'SpamCop', bl: 'bl.spamcop.net' },
    { name: 'Barracuda', bl: 'b.barracudacentral.org' },
    { name: 'SORBS', bl: 'dnsbl.sorbs.net' },
  ];
  const results = [];
  for (const { name, bl } of lists) {
    try {
      await dns.resolve4(`${domain}.${bl}`);
      results.push({ name, blacklist: bl, listed: true });
    } catch (err) {
      results.push({ name, blacklist: bl, listed: err.code === 'ENOTFOUND' ? false : null });
    }
  }
  return results;
}

async function fullDnsCheck(domain, dkimSelector = 'mail') {
  const [spf, dkim, dmarc, bimi, mx, blacklists] = await Promise.all([
    checkSpf(domain), checkDkim(domain, dkimSelector), checkDmarc(domain),
    checkBimi(domain), checkMx(domain), checkBlacklists(domain),
  ]);
  const allValid = [spf, dkim, dmarc].every(r => r.status === 'valid');
  return { domain, spf, dkim, dmarc, bimi, mx, blacklists, allValid, checkedAt: new Date().toISOString() };
}

module.exports = { checkSpf, checkDkim, checkDmarc, checkBimi, checkMx, checkBlacklists, fullDnsCheck };
