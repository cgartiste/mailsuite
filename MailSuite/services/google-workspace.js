/**
 * MailSuite — Google Workspace Service
 * Uses the official Google Admin SDK via googleapis.
 * Supports multiple service account credentials.
 */
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const SCOPES = [
  'https://www.googleapis.com/auth/admin.directory.user',
  'https://www.googleapis.com/auth/admin.directory.user.readonly',
  'https://www.googleapis.com/auth/admin.directory.domain',
  'https://www.googleapis.com/auth/admin.directory.domain.readonly',
  'https://www.googleapis.com/auth/admin.directory.group',
  'https://www.googleapis.com/auth/admin.directory.group.readonly',
  'https://www.googleapis.com/auth/admin.directory.orgunit',
  'https://www.googleapis.com/auth/admin.directory.orgunit.readonly',
  'https://www.googleapis.com/auth/siteverification',
];

const GW_MX_RECORDS = [
  { priority: 1,  content: 'aspmx.l.google.com' },
  { priority: 5,  content: 'alt1.aspmx.l.google.com' },
  { priority: 5,  content: 'alt2.aspmx.l.google.com' },
  { priority: 10, content: 'alt3.aspmx.l.google.com' },
  { priority: 10, content: 'alt4.aspmx.l.google.com' },
];

const FIRST_NAMES = [
  'James','John','Robert','Michael','William','David','Richard','Joseph','Thomas','Charles',
  'Mary','Patricia','Jennifer','Linda','Barbara','Elizabeth','Susan','Jessica','Sarah','Karen',
  'Emma','Liam','Olivia','Noah','Ava','Sophia','Isabella','Lucas','Mia','Charlotte',
  'Ethan','Amelia','Mason','Harper','Logan','Evelyn','Oliver','Abigail','Elijah','Emily',
  'Aiden','Madison','Caden','Ella','Jackson','Scarlett','Grayson','Victoria','Ryan','Grace',
];

const LAST_NAMES = [
  'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez',
  'Anderson','Taylor','Thomas','Jackson','White','Harris','Martin','Thompson','Wilson','Moore',
  'Lee','Clark','Lewis','Robinson','Walker','Hall','Allen','Young','King','Scott',
  'Green','Baker','Adams','Nelson','Carter','Mitchell','Perez','Roberts','Turner','Phillips',
];

class GoogleWorkspaceService {
  /**
   * @param {string} credentialsPath — Path to service account JSON file
   * @param {string} adminEmail — Super admin email to impersonate
   */
  constructor(credentialsPath, adminEmail) {
    this.credentialsPath = credentialsPath;
    this.adminEmail = adminEmail;
    this.domain = adminEmail.includes('@') ? adminEmail.split('@')[1] : '';
    this._service = null;
  }

  /** Lazily build the Admin SDK directory service */
  _getService() {
    if (this._service) return this._service;
    const auth = new google.auth.GoogleAuth({
      keyFile: this.credentialsPath,
      scopes: SCOPES,
      clientOptions: { subject: this.adminEmail },
    });
    this._service = google.admin({ version: 'directory_v1', auth });
    return this._service;
  }

  // ─── Connection Test ──────────────────────────────────────────────
  async testConnection() {
    try {
      const svc = this._getService();
      const res = await svc.domains.list({ customer: 'my_customer' });
      const domains = res.data.domains || [];
      return { success: true, domains, domainCount: domains.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ─── Domains ──────────────────────────────────────────────────────
  async listDomains() {
    try {
      const svc = this._getService();
      const res = await svc.domains.list({ customer: 'my_customer' });
      return res.data.domains || [];
    } catch {
      return [];
    }
  }

  // ─── Users ────────────────────────────────────────────────────────
  async listUsers(opts = {}) {
    const { domain, maxResults = 500, orderBy = 'email', query } = opts;
    const svc = this._getService();
    const users = [];
    let pageToken = null;

    const params = {
      customer: 'my_customer',
      maxResults: Math.min(maxResults, 500),
      orderBy,
    };
    if (domain) params.domain = domain;
    if (query) params.query = query;

    do {
      if (pageToken) params.pageToken = pageToken;
      try {
        const res = await svc.users.list(params);
        const batch = res.data.users || [];
        users.push(...batch);
        pageToken = res.data.nextPageToken || null;
        if (users.length >= maxResults) break;
      } catch {
        break;
      }
    } while (pageToken);

    return users;
  }

  async getUser(email) {
    try {
      const svc = this._getService();
      const res = await svc.users.get({ userKey: email });
      return res.data;
    } catch {
      return null;
    }
  }

  async createUser({ firstName, lastName, email, password, changePasswordAtLogin = false }) {
    const svc = this._getService();
    const res = await svc.users.insert({
      requestBody: {
        name: { givenName: firstName, familyName: lastName, fullName: `${firstName} ${lastName}` },
        primaryEmail: email,
        password,
        changePasswordAtNextLogin: changePasswordAtLogin,
      },
    });
    return res.data;
  }

  async updateUser(email, body) {
    const svc = this._getService();
    const res = await svc.users.update({ userKey: email, requestBody: body });
    return res.data;
  }

  async deleteUser(email) {
    try {
      const svc = this._getService();
      await svc.users.delete({ userKey: email });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async suspendUser(email, suspended = true) {
    try {
      const svc = this._getService();
      await svc.users.update({ userKey: email, requestBody: { suspended } });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async resetPassword(email, newPassword, forceChange = true) {
    try {
      const svc = this._getService();
      await svc.users.update({
        userKey: email,
        requestBody: { password: newPassword, changePasswordAtNextLogin: forceChange },
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async makeAdmin(email, isAdmin = true) {
    try {
      const svc = this._getService();
      await svc.users.makeAdmin({ userKey: email, requestBody: { status: isAdmin } });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ─── Domain Change ────────────────────────────────────────────────
  async changeDomain(oldEmail, newDomain) {
    const username = oldEmail.split('@')[0];
    const newEmail = `${username}@${newDomain}`;
    try {
      const svc = this._getService();
      await svc.users.update({ userKey: oldEmail, requestBody: { primaryEmail: newEmail } });
      return { success: true, oldEmail, newEmail };
    } catch (err) {
      return { success: false, oldEmail, newEmail, error: err.message };
    }
  }

  async bulkChangeDomain(emails, newDomain) {
    const changed = [], failed = [];
    for (const email of emails) {
      const r = await this.changeDomain(email, newDomain);
      (r.success ? changed : failed).push(r);
      await new Promise(ok => setTimeout(ok, 150));
    }
    return { changed, failed, total: emails.length, changedCount: changed.length, failedCount: failed.length };
  }

  // ─── Bulk Create ──────────────────────────────────────────────────
  async bulkCreateUsers(count, domain, password, suffixLen = 5) {
    const created = [], failed = [];
    const used = new Set();

    for (let i = 0; i < count; i++) {
      const fn = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
      const ln = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
      let suffix = Array.from({ length: suffixLen }, () => Math.floor(Math.random() * 10)).join('');
      let username = `${fn.toLowerCase()}.${ln.toLowerCase()}${suffix}`;
      while (used.has(username)) {
        suffix = Array.from({ length: suffixLen }, () => Math.floor(Math.random() * 10)).join('');
        username = `${fn.toLowerCase()}.${ln.toLowerCase()}${suffix}`;
      }
      used.add(username);
      const email = `${username}@${domain}`;

      try {
        await this.createUser({ firstName: fn, lastName: ln, email, password });
        created.push({ email, password, firstName: fn, lastName: ln });
      } catch (err) {
        const detail = err.response?.data?.error?.message || err.response?.data?.error || err.message;
        console.error(`[GW createUser] ${email} => ${detail}`);
        failed.push({ email, error: detail });
      }
      await new Promise(ok => setTimeout(ok, 200));
    }
    return { created, failed, total: count, createdCount: created.length, failedCount: failed.length };
  }

  // ─── Stats ────────────────────────────────────────────────────────
  async getDomainStats(domain) {
    try {
      const users = await this.listUsers({ domain, maxResults: 500 });
      const active = users.filter(u => !u.suspended).length;
      const suspended = users.filter(u => u.suspended).length;
      const twoFaOn = users.filter(u => u.isEnrolledIn2Sv).length;
      const admins = users.filter(u => u.isAdmin).length;

      return {
        success: true, domain,
        total: users.length, active, suspended,
        twoFaOn, twoFaOff: users.length - twoFaOn,
        admins,
        preview: users.slice(0, 50).map(u => ({
          email: u.primaryEmail,
          name: u.name?.fullName || '',
          suspended: !!u.suspended,
          twoFa: !!u.isEnrolledIn2Sv,
          admin: !!u.isAdmin,
          creationTime: u.creationTime,
          lastLoginTime: u.lastLoginTime,
          orgUnitPath: u.orgUnitPath || '/',
        })),
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ─── Domain Management ───────────────────────────────────────────

  /** Add a domain to GW. Returns {added, alreadyExists, error} */
  async addDomain(domainName) {
    const svc = this._getService();
    try {
      const res = await svc.domains.insert({
        customer: 'my_customer',
        requestBody: { domainName },
      });
      return { added: true, domain: res.data };
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || '';
      if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate')) {
        return { added: false, alreadyExists: true };
      }
      return { added: false, error: msg };
    }
  }

  /** Get Google Site Verification TXT token for a domain */
  async getDomainVerificationToken(domainName) {
    const auth = new google.auth.GoogleAuth({
      keyFile: this.credentialsPath,
      scopes: ['https://www.googleapis.com/auth/siteverification'],
      clientOptions: { subject: this.adminEmail },
    });
    const siteVerification = google.siteVerification({ version: 'v1', auth });
    const res = await siteVerification.webResource.getToken({
      requestBody: {
        site: { type: 'INET_DOMAIN', identifier: domainName },
        verificationMethod: 'DNS_TXT',
      },
    });
    return res.data.token; // e.g. "google-site-verification=XXXX"
  }

  /** Insert domain into Site Verification (trigger verification) */
  async verifyDomainSiteVerification(domainName) {
    const auth = new google.auth.GoogleAuth({
      keyFile: this.credentialsPath,
      scopes: ['https://www.googleapis.com/auth/siteverification'],
      clientOptions: { subject: this.adminEmail },
    });
    const siteVerification = google.siteVerification({ version: 'v1', auth });
    try {
      const res = await siteVerification.webResource.insert({
        verificationMethod: 'DNS_TXT',
        requestBody: {
          site: { type: 'INET_DOMAIN', identifier: domainName },
        },
      });
      return { success: true, data: res.data };
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      return { success: false, error: msg };
    }
  }

  /** Check if domain is verified in GW */
  async getDomainStatus(domainName) {
    const svc = this._getService();
    try {
      const res = await svc.domains.get({ customer: 'my_customer', domainName });
      return { verified: res.data.verified, domain: res.data };
    } catch {
      return { verified: false };
    }
  }

  getMxRecords() { return GW_MX_RECORDS; }

  // ─── Org Units ────────────────────────────────────────────────────
  async listOrgUnits() {
    try {
      const svc = this._getService();
      const res = await svc.orgunits.list({ customerId: 'my_customer' });
      return res.data.organizationUnits || [];
    } catch {
      return [];
    }
  }

  // ─── Groups ───────────────────────────────────────────────────────
  async listGroups(domain) {
    try {
      const svc = this._getService();
      const res = await svc.groups.list({ customer: 'my_customer', domain });
      return res.data.groups || [];
    } catch {
      return [];
    }
  }

  // ─── Static Helpers ───────────────────────────────────────────────
  static validateJson(filepath) {
    try {
      const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
      const required = ['type', 'project_id', 'private_key_id', 'private_key', 'client_email'];
      const missing = required.filter(k => !data[k]);
      if (missing.length) return { valid: false, error: `Champs manquants: ${missing.join(', ')}` };
      if (data.type !== 'service_account') return { valid: false, error: `Type "${data.type}" incorrect — attendu "service_account"` };
      return { valid: true, clientEmail: data.client_email };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  static getJsonInfo(filepath) {
    try {
      const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
      return { clientEmail: data.client_email, projectId: data.project_id, clientId: data.client_id };
    } catch {
      return {};
    }
  }
}

module.exports = { GoogleWorkspaceService, FIRST_NAMES, LAST_NAMES };
