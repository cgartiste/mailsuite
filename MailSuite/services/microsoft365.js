const { ConfidentialClientApplication } = require('@azure/msal-node');
require('isomorphic-fetch');
const { Client } = require('@microsoft/microsoft-graph-client');

const _instances = {};

function getMsInstance(accountId, row) {
  const cached = _instances[accountId];
  if (cached && Date.now() - cached.ts < 3500000) return cached.instance;
  const inst = new Microsoft365Service({ tenantId: row.tenant_id, clientId: row.client_id, clientSecret: row.client_secret });
  _instances[accountId] = { instance: inst, ts: Date.now() };
  return inst;
}

function invalidateMsInstance(accountId) {
  delete _instances[accountId];
}

class Microsoft365Service {
  constructor({ tenantId, clientId, clientSecret }) {
    this.tenantId = tenantId;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this._tokenCache = null;
    this._msalApp = new ConfidentialClientApplication({
      auth: { clientId, authority: `https://login.microsoftonline.com/${tenantId}`, clientSecret },
    });
    this._cache = {};
  }

  async _getClient() {
    const now = Date.now();
    if (this._tokenCache && now < this._tokenCache.expiresAt) {
      return this._tokenCache.client;
    }
    const tokenResp = await this._msalApp.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default'],
    });
    const client = Client.init({ authProvider: (done) => done(null, tokenResp.accessToken) });
    this._tokenCache = { client, expiresAt: now + 3500000 };
    return client;
  }

  _getCached(key) {
    const e = this._cache[key];
    if (e && Date.now() < e.expiresAt) return e.data;
    return null;
  }

  _setCached(key, data, ttlMs = 60000) {
    this._cache[key] = { data, expiresAt: Date.now() + ttlMs };
  }

  // ─── Connection Test ──────────────────────────────────────────────
  async testConnection() {
    try {
      const client = await this._getClient();
      const org = await client.api('/organization').get();
      const domains = await client.api('/domains').get();
      return {
        success: true,
        organization: org.value?.[0]?.displayName || 'Unknown',
        domainCount: (domains.value || []).length,
        domains: domains.value || [],
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ─── Organization ─────────────────────────────────────────────────
  async getOrganizationDetails() {
    const cached = this._getCached('org');
    if (cached) return cached;
    try {
      const client = await this._getClient();
      const res = await client.api('/organization').get();
      const data = res.value?.[0] || null;
      this._setCached('org', data, 300000);
      return data;
    } catch { return null; }
  }

  // ─── Domains ──────────────────────────────────────────────────────
  async listDomains() {
    const cached = this._getCached('domains');
    if (cached) return cached;
    try {
      const client = await this._getClient();
      const res = await client.api('/domains').get();
      const data = res.value || [];
      this._setCached('domains', data, 120000);
      return data;
    } catch { return []; }
  }

  async getDomain(domainId) {
    try {
      const client = await this._getClient();
      return await client.api(`/domains/${domainId}`).get();
    } catch { return null; }
  }

  async getDomainDnsRecords(domainId) {
    try {
      const client = await this._getClient();
      const res = await client.api(`/domains/${domainId}/serviceConfigurationRecords`).get();
      return res.value || [];
    } catch { return []; }
  }

  async addDomainDnsRecord(domainId, record) {
    const client = await this._getClient();
    return await client.api(`/domains/${domainId}/serviceConfigurationRecords`).post(record);
  }

  // ─── Users ────────────────────────────────────────────────────────
  async listUsers(opts = {}) {
    const cacheKey = `users_${opts.domain || ''}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;
    try {
      const client = await this._getClient();
      let req = client.api('/users')
        .select('id,displayName,userPrincipalName,mail,accountEnabled,assignedLicenses,createdDateTime')
        .top(opts.maxResults || 999);
      if (opts.filter) req = req.filter(opts.filter);
      const res = await req.get();
      let users = res.value || [];
      if (opts.domain) users = users.filter(u => u.userPrincipalName?.endsWith(`@${opts.domain}`));
      this._setCached(cacheKey, users, 60000);
      return users;
    } catch { return []; }
  }

  async getUserDetails(userId) {
    try {
      const client = await this._getClient();
      return await client.api(`/users/${userId}`)
        .select('id,displayName,userPrincipalName,mail,accountEnabled,assignedLicenses,createdDateTime,jobTitle,department,officeLocation,mobilePhone,businessPhones')
        .get();
    } catch { return null; }
  }

  async getUser(userId) {
    try {
      const client = await this._getClient();
      return await client.api(`/users/${userId}`).get();
    } catch { return null; }
  }

  async createUser({ displayName, email, password, forceChangePassword = true }) {
    const client = await this._getClient();
    const mailNickname = email.split('@')[0];
    const result = await client.api('/users').post({
      accountEnabled: true,
      displayName,
      mailNickname,
      userPrincipalName: email,
      passwordProfile: { forceChangePasswordNextSignIn: forceChangePassword, password },
    });
    this._cache = {};
    return result;
  }

  async deleteUser(userId) {
    try {
      const client = await this._getClient();
      await client.api(`/users/${userId}`).delete();
      this._cache = {};
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  }

  async disableUser(userId) {
    try {
      const client = await this._getClient();
      await client.api(`/users/${userId}`).update({ accountEnabled: false });
      this._cache = {};
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  }

  async enableUser(userId) {
    try {
      const client = await this._getClient();
      await client.api(`/users/${userId}`).update({ accountEnabled: true });
      this._cache = {};
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  }

  async resetPassword(userId, newPassword, forceChange = true) {
    try {
      const client = await this._getClient();
      await client.api(`/users/${userId}`).update({
        passwordProfile: { forceChangePasswordNextSignIn: forceChange, password: newPassword },
      });
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  }

  async setMailboxAlias(userId, alias) {
    try {
      const client = await this._getClient();
      const user = await client.api(`/users/${userId}`).select('proxyAddresses').get();
      const existing = user.proxyAddresses || [];
      if (!existing.includes(`smtp:${alias}`)) {
        existing.push(`smtp:${alias}`);
        await client.api(`/users/${userId}`).update({ proxyAddresses: existing });
      }
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  }

  // ─── Bulk Create ──────────────────────────────────────────────────
  async bulkCreateUsers(count, domain, password) {
    const FIRST = ['James','John','Michael','David','Sarah','Emma','Olivia','Sophia','Liam','Noah','Ava','Isabella','Ethan','Mason','Harper'];
    const LAST = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Wilson','Moore','Taylor','Anderson','Thomas','Jackson'];
    const created = [], failed = [];
    const used = new Set();
    for (let i = 0; i < count; i++) {
      const fn = FIRST[Math.floor(Math.random()*FIRST.length)];
      const ln = LAST[Math.floor(Math.random()*LAST.length)];
      let suffix = String(Math.floor(Math.random()*99999)).padStart(5,'0');
      let username = `${fn.toLowerCase()}.${ln.toLowerCase()}${suffix}`;
      while (used.has(username)) {
        suffix = String(Math.floor(Math.random()*99999)).padStart(5,'0');
        username = `${fn.toLowerCase()}.${ln.toLowerCase()}${suffix}`;
      }
      used.add(username);
      const email = `${username}@${domain}`;
      try {
        await this.createUser({ displayName: `${fn} ${ln}`, email, password });
        created.push({ email, password, firstName: fn, lastName: ln });
      } catch (err) { failed.push({ email, error: err.message }); }
      await new Promise(ok => setTimeout(ok, 200));
    }
    return { created, failed, total: count, createdCount: created.length, failedCount: failed.length };
  }

  // ─── Groups ───────────────────────────────────────────────────────
  async listGroups() {
    const cached = this._getCached('groups');
    if (cached) return cached;
    try {
      const client = await this._getClient();
      const res = await client.api('/groups').select('id,displayName,description,groupTypes,mailEnabled,securityEnabled,createdDateTime').top(999).get();
      const data = res.value || [];
      this._setCached('groups', data, 60000);
      return data;
    } catch { return []; }
  }

  async createGroup(data) {
    const client = await this._getClient();
    const result = await client.api('/groups').post({
      displayName: data.displayName,
      description: data.description || '',
      mailEnabled: data.mailEnabled || false,
      mailNickname: data.mailNickname || data.displayName.replace(/\s+/g,'').toLowerCase(),
      securityEnabled: data.securityEnabled !== false,
      groupTypes: data.groupTypes || [],
    });
    delete this._cache['groups'];
    return result;
  }

  async deleteGroup(id) {
    try {
      const client = await this._getClient();
      await client.api(`/groups/${id}`).delete();
      delete this._cache['groups'];
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  }

  async listGroupMembers(groupId) {
    try {
      const client = await this._getClient();
      const res = await client.api(`/groups/${groupId}/members`).select('id,displayName,userPrincipalName,mail').get();
      return res.value || [];
    } catch { return []; }
  }

  async addGroupMember(groupId, userId) {
    try {
      const client = await this._getClient();
      await client.api(`/groups/${groupId}/members/$ref`).post({
        '@odata.id': `https://graph.microsoft.com/v1.0/directoryObjects/${userId}`,
      });
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  }

  async removeGroupMember(groupId, userId) {
    try {
      const client = await this._getClient();
      await client.api(`/groups/${groupId}/members/${userId}/$ref`).delete();
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  }

  // ─── Licenses ─────────────────────────────────────────────────────
  async getSubscribedSkus() {
    const cached = this._getCached('skus');
    if (cached) return cached;
    try {
      const client = await this._getClient();
      const res = await client.api('/subscribedSkus').get();
      const data = res.value || [];
      this._setCached('skus', data, 300000);
      return data;
    } catch { return []; }
  }

  async assignLicense(userId, skuId) {
    try {
      const client = await this._getClient();
      await client.api(`/users/${userId}/assignLicense`).post({
        addLicenses: [{ skuId, disabledPlans: [] }],
        removeLicenses: [],
      });
      this._cache = {};
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  }

  async removeLicense(userId, skuId) {
    try {
      const client = await this._getClient();
      await client.api(`/users/${userId}/assignLicense`).post({
        addLicenses: [],
        removeLicenses: [skuId],
      });
      this._cache = {};
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  }

  async bulkAssignLicense(userIds, skuId) {
    const results = [];
    for (const uid of userIds) {
      results.push({ userId: uid, ...(await this.assignLicense(uid, skuId)) });
    }
    return results;
  }

  // ─── MFA ──────────────────────────────────────────────────────────
  async getUserMfaStatus(userId) {
    try {
      const client = await this._getClient();
      const res = await client.api(`/users/${userId}/authentication/methods`).get();
      const methods = res.value || [];
      const hasMfa = methods.some(m => m['@odata.type'] !== '#microsoft.graph.passwordAuthenticationMethod');
      return { success: true, hasMfa, methods };
    } catch (err) { return { success: false, error: err.message }; }
  }

  // ─── Audit & Sign-in Logs ─────────────────────────────────────────
  async listSignInLogs(opts = {}) {
    try {
      const client = await this._getClient();
      let req = client.api('https://graph.microsoft.com/beta/auditLogs/signIns').top(opts.top || 50);
      if (opts.filter) req = req.filter(opts.filter);
      const res = await req.get();
      return res.value || [];
    } catch { return []; }
  }

  async listAuditLogs(opts = {}) {
    try {
      const client = await this._getClient();
      let req = client.api('https://graph.microsoft.com/beta/auditLogs/directoryAudits').top(opts.top || 50);
      if (opts.filter) req = req.filter(opts.filter);
      const res = await req.get();
      return res.value || [];
    } catch { return []; }
  }

  // ─── Shared Mailboxes ─────────────────────────────────────────────
  async listSharedMailboxes() {
    const cached = this._getCached('mailboxes');
    if (cached) return cached;
    try {
      const client = await this._getClient();
      const res = await client.api('/users').filter("userType eq 'Guest' or assignedLicenses/$count eq 0").select('id,displayName,mail,userPrincipalName').top(999).get();
      const data = (res.value || []).filter(u => u.mail);
      this._setCached('mailboxes', data, 60000);
      return data;
    } catch { return []; }
  }

  async createSharedMailbox(data) {
    const client = await this._getClient();
    const result = await client.api('/users').post({
      accountEnabled: false,
      displayName: data.displayName,
      mailNickname: data.mailNickname || data.displayName.replace(/\s+/g,'').toLowerCase(),
      userPrincipalName: data.email,
      passwordProfile: { forceChangePasswordNextSignIn: false, password: `Shared@${Date.now()}` },
    });
    delete this._cache['mailboxes'];
    return result;
  }

  // ─── Export ───────────────────────────────────────────────────────
  async exportUsersCSV(domain) {
    const users = await this.listUsers({ domain });
    const header = 'Email,DisplayName,Enabled,Licensed,CreatedDateTime';
    const rows = users.map(u => [
      u.userPrincipalName,
      `"${(u.displayName||'').replace(/"/g,'""')}"`,
      u.accountEnabled ? 'Yes' : 'No',
      (u.assignedLicenses?.length || 0) > 0 ? 'Yes' : 'No',
      u.createdDateTime || '',
    ].join(','));
    return [header, ...rows].join('\n');
  }

  // ─── Fast Stats ───────────────────────────────────────────────────
  async fastGetStats() {
    try {
      const cached = this._getCached('fast_stats');
      if (cached) return cached;
      const client = await this._getClient();
      const [totalRes, activeRes, disabledRes, domainsRes, skusRes] = await Promise.all([
        client.api('/users/$count').header('ConsistencyLevel', 'eventual').get(),
        client.api('/users/$count').header('ConsistencyLevel', 'eventual').filter('accountEnabled eq true').get(),
        client.api('/users/$count').header('ConsistencyLevel', 'eventual').filter('accountEnabled eq false').get(),
        this.listDomains(),
        this.getSubscribedSkus(),
      ]);
      const totalUsers = typeof totalRes === 'number' ? totalRes : parseInt(totalRes) || 0;
      const active = typeof activeRes === 'number' ? activeRes : parseInt(activeRes) || 0;
      const disabled = typeof disabledRes === 'number' ? disabledRes : parseInt(disabledRes) || 0;
      const licensed = skusRes.reduce((s, sku) => s + (sku.consumedUnits || 0), 0);
      const data = { success: true, totalUsers, active, disabled, licensed, domainCount: domainsRes.length, domains: domainsRes };
      this._setCached('fast_stats', data, 30000);
      return data;
    } catch (err) {
      try {
        return await this.getStats();
      } catch { return { success: false, error: err.message }; }
    }
  }

  // ─── Stats (full) ─────────────────────────────────────────────────
  async getStats() {
    try {
      const users = await this.listUsers();
      const domains = await this.listDomains();
      const active = users.filter(u => u.accountEnabled).length;
      const disabled = users.filter(u => !u.accountEnabled).length;
      const licensed = users.filter(u => u.assignedLicenses?.length > 0).length;
      return { success: true, totalUsers: users.length, active, disabled, licensed, domainCount: domains.length, domains, users: users.slice(0, 50) };
    } catch (err) { return { success: false, error: err.message }; }
  }
}

module.exports = { Microsoft365Service, getMsInstance, invalidateMsInstance };
