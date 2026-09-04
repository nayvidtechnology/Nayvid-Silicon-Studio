import type { HashChainedAuditLog } from './index.js';
import type { ProjectRole } from './types.js';

export interface OidcTokenClaims {
  sub: string;
  email: string;
  name?: string;
  groups?: string[];
  roles?: string[];
  iss: string;
  aud: string;
  exp: number;
}

export interface OidcProviderOptions {
  issuer: string;
  clientId: string;
  groupRoleMap?: Record<string, ProjectRole>;
}

export class OidcIdentityProvider {
  constructor(private options: OidcProviderOptions) {}

  verifyClaims(claims: OidcTokenClaims, nowSec = Math.floor(Date.now() / 1000)): { valid: boolean; reason?: string; role?: ProjectRole } {
    if (claims.iss !== this.options.issuer) return { valid: false, reason: `Issuer mismatch: expected ${this.options.issuer}, got ${claims.iss}` };
    if (claims.aud !== this.options.clientId) return { valid: false, reason: `Audience mismatch: expected ${this.options.clientId}, got ${claims.aud}` };
    if (claims.exp <= nowSec) return { valid: false, reason: 'OIDC token expired' };

    let role: ProjectRole = 'viewer';
    const groupRoleMap = this.options.groupRoleMap ?? {};
    for (const group of claims.groups ?? []) {
      if (groupRoleMap[group]) {
        role = groupRoleMap[group];
        break;
      }
    }
    return { valid: true, role };
  }
}

export interface SamlAssertion {
  nameId: string;
  email: string;
  groups?: string[];
  issuer: string;
  authnInstant: string;
  notOnOrAfterSec: number;
}

export interface SamlProviderOptions {
  entityId: string;
  groupRoleMap?: Record<string, ProjectRole>;
}

export class SamlIdentityProvider {
  constructor(private options: SamlProviderOptions) {}

  verifyAssertion(assertion: SamlAssertion, nowSec = Math.floor(Date.now() / 1000)): { valid: boolean; reason?: string; role?: ProjectRole } {
    if (assertion.issuer !== this.options.entityId) return { valid: false, reason: `SAML Issuer mismatch: expected ${this.options.entityId}` };
    if (assertion.notOnOrAfterSec <= nowSec) return { valid: false, reason: 'SAML assertion expired' };

    let role: ProjectRole = 'viewer';
    const groupRoleMap = this.options.groupRoleMap ?? {};
    for (const group of assertion.groups ?? []) {
      if (groupRoleMap[group]) {
        role = groupRoleMap[group];
        break;
      }
    }
    return { valid: true, role };
  }
}

export interface ScimUser {
  id: string;
  userName: string;
  emails: Array<{ value: string; primary?: boolean }>;
  name?: { formatted?: string };
  active: boolean;
  groups?: Array<{ value: string; display?: string }>;
}

export class ScimSyncService {
  private users = new Map<string, ScimUser>();

  provisionUser(user: ScimUser): ScimUser {
    this.users.set(user.id, user);
    return user;
  }

  deprovisionUser(id: string): boolean {
    const existing = this.users.get(id);
    if (!existing) return false;
    existing.active = false;
    this.users.set(id, existing);
    return true;
  }

  getUser(id: string): ScimUser | undefined {
    return this.users.get(id);
  }

  listUsers(): ScimUser[] {
    return [...this.users.values()];
  }
}

export class EnterpriseAuthManager {
  constructor(
    private oidc?: OidcIdentityProvider,
    private saml?: SamlIdentityProvider,
    private scim?: ScimSyncService,
    private audit?: HashChainedAuditLog
  ) {}

  authenticateOidc(claims: OidcTokenClaims): { actor: string; role: ProjectRole } {
    if (!this.oidc) throw new Error('OIDC provider is not configured');
    const result = this.oidc.verifyClaims(claims);
    const actor = claims.email || claims.sub;
    if (!result.valid || !result.role) {
      this.audit?.append({ actor, action: 'auth:oidc', resource: 'sso', outcome: 'denied', details: { reason: result.reason } });
      throw new Error(`OIDC Authentication failed: ${result.reason}`);
    }
    this.audit?.append({ actor, action: 'auth:oidc', resource: 'sso', outcome: 'success', details: { role: result.role } });
    return { actor, role: result.role };
  }

  authenticateSaml(assertion: SamlAssertion): { actor: string; role: ProjectRole } {
    if (!this.saml) throw new Error('SAML provider is not configured');
    const result = this.saml.verifyAssertion(assertion);
    const actor = assertion.email || assertion.nameId;
    if (!result.valid || !result.role) {
      this.audit?.append({ actor, action: 'auth:saml', resource: 'sso', outcome: 'denied', details: { reason: result.reason } });
      throw new Error(`SAML Authentication failed: ${result.reason}`);
    }
    this.audit?.append({ actor, action: 'auth:saml', resource: 'sso', outcome: 'success', details: { role: result.role } });
    return { actor, role: result.role };
  }
}
