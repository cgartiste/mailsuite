/**
 * MailSuite — Cloudflare API Service
 * Official REST API v4 wrapper with multi-account support.
 * Includes full pagination support + in-memory zone cache (5 min TTL).
 */
const fetch = require('node-fetch');
const BASE = 'https://api.cloudflare.com/client/v4';

// ─── In-memory zone cache ────────────────────────────────────────────────────
// Avoids hammering the CF API on every request.
// Key: api_token, Value: { zones: [], ts: Date.now() }
const _zoneCache = new Map();
const CACHE_TTL  = 5 * 60 * 1000; // 5 minutes

class CloudflareService {
  constructor(token) {
    this.token   = token;
    this.headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  async _req(method, path, data, params) {
    let url = `${BASE}${path}`;
    if (params) url += '?' + new URLSearchParams(params).toString();
    try {
      const opts = { method, headers: this.headers, timeout: 20000 };
      if (data) opts.body = JSON.stringify(data);
      return await (await fetch(url, opts)).json();
    } catch (err) { return { success: false, errors: [{ message: err.message }] }; }
  }

  // ─── Cloudflare GraphQL API (for Analytics) ───────────────────────────────
  async _gql(query, variables = {}) {
    try {
      const resp = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ query, variables }),
        timeout: 30000,
      });
      return await resp.json();
    } catch (err) { return { errors: [{ message: err.message }] }; }
  }

  // Analytics via GraphQL — periods: '24h', '7d', '30d'
  async getZoneAnalyticsGql(zoneTag, period = '7d') {
    const now     = new Date();
    let since, dataset, dateFilter;

    if (period === '24h') {
      since     = new Date(now - 24 * 3600 * 1000);
      dataset   = 'httpRequests1hGroups';
      dateFilter = `datetime_geq: "${since.toISOString()}", datetime_lt: "${now.toISOString()}"`;
    } else if (period === '30d') {
      since     = new Date(now - 30 * 86400 * 1000);
      dataset   = 'httpRequests1dGroups';
      const startDate = since.toISOString().slice(0, 10);
      const endDate   = now.toISOString().slice(0, 10);
      dateFilter = `date_geq: "${startDate}", date_leq: "${endDate}"`;
    } else {
      // Default 7d
      since     = new Date(now - 7 * 86400 * 1000);
      dataset   = 'httpRequests1dGroups';
      const startDate = since.toISOString().slice(0, 10);
      const endDate   = now.toISOString().slice(0, 10);
      dateFilter = `date_geq: "${startDate}", date_leq: "${endDate}"`;
    }

    const query = `{
      viewer {
        zones(filter: { zoneTag: "${zoneTag}" }) {
          timeseries: ${dataset}(
            orderBy: [date_ASC]
            limit: 100
            filter: { ${dateFilter} }
          ) {
            dimensions { date }
            sum { requests cachedRequests bytes cachedBytes threats pageViews }
            uniq { uniques }
          }
          statusGroups: ${dataset}(
            orderBy: [sum_requests_DESC]
            limit: 50
            filter: { ${dateFilter} }
          ) {
            dimensions { edgeResponseStatus }
            sum { requests }
          }
          countryGroups: ${dataset}(
            orderBy: [sum_requests_DESC]
            limit: 20
            filter: { ${dateFilter} }
          ) {
            dimensions { clientCountryName }
            sum { requests threats }
          }
        }
      }
    }`;
    return this._gql(query);
  }

  // ─── Zones — single page (kept for add-account validation only) ───────────
  async getZones(page = 1, perPage = 50) {
    return this._req('GET', '/zones', null, { page, per_page: perPage });
  }

  // ─── Zones — ALL pages with cache ─────────────────────────────────────────
  async getAllZones({ forceRefresh = false } = {}) {
    const cached = _zoneCache.get(this.token);
    if (!forceRefresh && cached && Date.now() - cached.ts < CACHE_TTL) {
      return cached.zones;
    }

    const allZones = [];
    let page = 1;
    while (true) {
      const r = await this._req('GET', '/zones', null, { page, per_page: 50 });
      if (!r.success) break;
      allZones.push(...(r.result || []));
      const info = r.result_info || {};
      const totalPages = info.total_pages || Math.ceil((info.total_count || 0) / 50) || 1;
      if (page >= totalPages || !(r.result || []).length) break;
      page++;
    }

    _zoneCache.set(this.token, { zones: allZones, ts: Date.now() });
    return allZones;
  }

  // Invalidate cache (call after write operations)
  clearZoneCache() { _zoneCache.delete(this.token); }

  async getZone(zid) { return this._req('GET', `/zones/${zid}`); }
  async purgeCache(zid) { return this._req('POST', `/zones/${zid}/purge_cache`, { purge_everything: true }); }

  // ─── DNS ──────────────────────────────────────────────────────────────────
  async getDnsRecords(zid, opts = {}) {
    return this._req('GET', `/zones/${zid}/dns_records`, null, {
      per_page: opts.perPage || 500,
      ...(opts.type ? { type: opts.type } : {}),
      ...(opts.name ? { name: opts.name } : {}),
    });
  }
  async createDnsRecord(zid, d) {
    const data = { type: d.type, name: d.name, content: d.content, ttl: d.ttl || 1, proxied: !!d.proxied };
    if (d.priority != null) data.priority = d.priority;
    return this._req('POST', `/zones/${zid}/dns_records`, data);
  }
  async updateDnsRecord(zid, rid, d) {
    const data = { type: d.type, name: d.name, content: d.content, ttl: d.ttl || 1, proxied: !!d.proxied };
    if (d.priority != null) data.priority = d.priority;
    return this._req('PUT', `/zones/${zid}/dns_records/${rid}`, data);
  }
  async deleteDnsRecord(zid, rid) { return this._req('DELETE', `/zones/${zid}/dns_records/${rid}`); }

  async upsertDnsRecord(zid, d) {
    const ex   = await this.getDnsRecords(zid, { type: d.type, name: d.name });
    const recs = ex.result || [];
    return recs.length ? this.updateDnsRecord(zid, recs[0].id, d) : this.createDnsRecord(zid, d);
  }

  // ─── Email Routing ────────────────────────────────────────────────────────
  async getEmailRouting(zid)           { return this._req('GET',  `/zones/${zid}/email/routing`); }
  async enableEmailRouting(zid)        { return this._req('POST', `/zones/${zid}/email/routing/enable`); }
  async disableEmailRouting(zid)       { return this._req('POST', `/zones/${zid}/email/routing/disable`); }
  async getEmailRoutingRules(zid)      { return this._req('GET',  `/zones/${zid}/email/routing/rules`); }
  async createEmailRoutingRule(zid, d) { return this._req('POST', `/zones/${zid}/email/routing/rules`, d); }
  async deleteEmailRoutingRule(zid, rid){ return this._req('DELETE', `/zones/${zid}/email/routing/rules/${rid}`); }

  // ─── Workers & Accounts ───────────────────────────────────────────────────
  async getAccounts()            { return this._req('GET', '/accounts'); }
  async getWorkersScripts(aid)   { return this._req('GET', `/accounts/${aid}/workers/scripts`); }

  // ─── Analytics ────────────────────────────────────────────────────────────
  async getZoneAnalytics(zid)    { return this._req('GET', `/zones/${zid}/analytics/dashboard`, null, { since: '-10080', until: '0' }); }

  // ─── Settings ─────────────────────────────────────────────────────────────
  async getZoneSettings(zid)     { return this._req('GET', `/zones/${zid}/settings`); }
  async getSslSettings(zid)      { return this._req('GET', `/zones/${zid}/settings/ssl`); }

  // ─── Email Auth ───────────────────────────────────────────────────────────
  async getEmailAuthRecords(zid, domain, dkimSel = 'mail') {
    const r = { spf: null, dkim: null, dmarc: null, bimi: null, mx: [] };
    const spf = await this.getDnsRecords(zid, { name: domain, type: 'TXT' });
    for (const x of (spf.result || [])) if (x.content?.includes('v=spf1')) r.spf = x;
    const dk = await this.getDnsRecords(zid, { name: `${dkimSel}._domainkey.${domain}`, type: 'TXT' });
    if ((dk.result || []).length) r.dkim = dk.result[0];
    const dm = await this.getDnsRecords(zid, { name: `_dmarc.${domain}`, type: 'TXT' });
    if ((dm.result || []).length) r.dmarc = dm.result[0];
    const bi = await this.getDnsRecords(zid, { name: `default._bimi.${domain}`, type: 'TXT' });
    if ((bi.result || []).length) r.bimi = bi.result[0];
    const mx = await this.getDnsRecords(zid, { type: 'MX' });
    r.mx = (mx.result || []).filter(x => x.name?.includes(domain));
    return r;
  }

  // ─── Find zone by domain — uses cached getAllZones ─────────────────────────
  async findZoneByDomain(domain, zones = null) {
    // Accept pre-fetched zones list to avoid redundant API calls
    const allZones = zones || await this.getAllZones();
    const exact = allZones.find(z => z.name === domain);
    if (exact) return exact;
    const parts = domain.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      const p = parts.slice(i).join('.');
      const m = allZones.find(z => z.name === p);
      if (m) return m;
    }
    return null;
  }

  async deployEmailAuth(zid, domain, opts = {}) {
    const res = {};
    if (opts.spf !== false)  res.spf   = await this.upsertDnsRecord(zid, { type: 'TXT', name: domain, content: opts.spfContent || 'v=spf1 include:_spf.google.com include:spf.protection.outlook.com ~all' });
    if (opts.dmarc !== false) res.dmarc = await this.upsertDnsRecord(zid, { type: 'TXT', name: `_dmarc.${domain}`, content: opts.dmarcContent || `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; pct=100; adkim=s; aspf=s` });
    if (opts.bimi) res.bimi = await this.upsertDnsRecord(zid, { type: 'TXT', name: `default._bimi.${domain}`, content: `v=BIMI1; l=https://${domain}/logo.svg` });
    if (opts.dkimMicrosoft) {
      const dk = domain.replace(/\./g, '-');
      res.dkimMs1 = await this.upsertDnsRecord(zid, { type: 'CNAME', name: `selector1._domainkey.${domain}`, content: `selector1-${dk}._domainkey.${opts.msTenant || domain}.onmicrosoft.com`, proxied: false });
      res.dkimMs2 = await this.upsertDnsRecord(zid, { type: 'CNAME', name: `selector2._domainkey.${domain}`, content: `selector2-${dk}._domainkey.${opts.msTenant || domain}.onmicrosoft.com`, proxied: false });
    }
    return res;
  }

  static isConfigured(t) { return !!(t && t.trim()); }
  static getError(r)     { return (r.errors || [])[0]?.message || 'Erreur inconnue'; }
}

module.exports = { CloudflareService };
