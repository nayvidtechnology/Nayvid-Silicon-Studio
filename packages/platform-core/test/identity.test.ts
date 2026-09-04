import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EnterpriseAuthManager, HashChainedAuditLog, OidcIdentityProvider, SamlIdentityProvider, ScimSyncService } from '../src/index.js';

describe('Enterprise Identity & SSO/SCIM Hardening', () => {
  let tmpDir: string;
  let auditLog: HashChainedAuditLog;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'identity-test-'));
    auditLog = new HashChainedAuditLog(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects OIDC claims with invalid issuer, audience, or expired timestamp', () => {
    const oidc = new OidcIdentityProvider({
      issuer: 'https://auth.enterprise.com',
      clientId: 'nayvid-silicon-studio',
      groupRoleMap: { 'silicon-leads': 'lead' },
    });

    const nowSec = Math.floor(Date.now() / 1000);

    const badIss = oidc.verifyClaims({
      sub: 'u1', email: 'e1@test.com', groups: ['silicon-leads'],
      iss: 'https://attacker.com', aud: 'nayvid-silicon-studio', exp: nowSec + 3600,
    }, nowSec);
    expect(badIss.valid).toBe(false);
    expect(badIss.reason).toContain('Issuer mismatch');

    const badAud = oidc.verifyClaims({
      sub: 'u1', email: 'e1@test.com', groups: ['silicon-leads'],
      iss: 'https://auth.enterprise.com', aud: 'other-app', exp: nowSec + 3600,
    }, nowSec);
    expect(badAud.valid).toBe(false);
    expect(badAud.reason).toContain('Audience mismatch');

    const expired = oidc.verifyClaims({
      sub: 'u1', email: 'e1@test.com', groups: ['silicon-leads'],
      iss: 'https://auth.enterprise.com', aud: 'nayvid-silicon-studio', exp: nowSec - 1,
    }, nowSec);
    expect(expired.valid).toBe(false);
    expect(expired.reason).toContain('expired');
  });

  it('handles SAML assertion validation and role fallback for unmapped groups', () => {
    const saml = new SamlIdentityProvider({
      entityId: 'https://idp.enterprise.com',
      groupRoleMap: { 'verification-engineers': 'engineer' },
    });

    const nowSec = Math.floor(Date.now() / 1000);

    const unmapped = saml.verifyAssertion({
      nameId: 'guest@enterprise.com', email: 'guest@enterprise.com', groups: ['unmapped-group'],
      issuer: 'https://idp.enterprise.com', authnInstant: new Date().toISOString(), notOnOrAfterSec: nowSec + 1800,
    }, nowSec);
    expect(unmapped.valid).toBe(true);
    expect(unmapped.role).toBe('viewer'); // Default role fallback
  });

  it('provisions, retrieves, and deprovisions SCIM users', () => {
    const scim = new ScimSyncService();
    scim.provisionUser({
      id: 'scim-1',
      userName: 'alice@enterprise.com',
      emails: [{ value: 'alice@enterprise.com', primary: true }],
      active: true,
    });

    expect(scim.getUser('scim-1')?.active).toBe(true);
    scim.deprovisionUser('scim-1');
    expect(scim.getUser('scim-1')?.active).toBe(false);
  });

  it('records successful and denied auth events in audit log', () => {
    const oidc = new OidcIdentityProvider({
      issuer: 'https://auth.enterprise.com',
      clientId: 'nayvid-silicon-studio',
      groupRoleMap: { 'admins': 'admin' },
    });

    const auth = new EnterpriseAuthManager(oidc, undefined, undefined, auditLog);
    const nowSec = Math.floor(Date.now() / 1000);

    expect(() => auth.authenticateOidc({
      sub: 'bad-1', email: 'bad@enterprise.com',
      iss: 'https://invalid-issuer.com', aud: 'nayvid-silicon-studio', exp: nowSec + 3600,
    })).toThrow('OIDC Authentication failed');

    const authRes = auth.authenticateOidc({
      sub: 'admin-1', email: 'admin@enterprise.com', groups: ['admins'],
      iss: 'https://auth.enterprise.com', aud: 'nayvid-silicon-studio', exp: nowSec + 3600,
    });
    expect(authRes.role).toBe('admin');

    const events = auditLog.read();
    expect(events.length).toBe(2);
    expect(events[0].outcome).toBe('denied');
    expect(events[1].outcome).toBe('success');
  });
});
