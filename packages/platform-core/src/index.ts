import * as fs from 'fs';
import * as path from 'path';
import { createHash, createPublicKey, verify as verifySignature } from 'crypto';
import type {
  ArtifactRef,
  AuditEvent,
  LicenseDecision,
  ProjectAction,
  ProjectManifest,
  ProjectRole,
  ProductionReadinessReport,
  RunKind,
  RunRecord,
  SignedLicense,
  SignoffDecision,
  SignoffEvidence,
  SignoffPolicy,
  ToolchainCheck,
  ToolchainProbe,
} from './types.js';
export * from './types.js';

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableJson(obj[key])}`).join(',')}}`;
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function assertRelativeWorkspacePath(value: string, label: string): void {
  if (!value || path.isAbsolute(value) || value.split(/[\\/]+/).includes('..')) throw new Error(`${label} must stay inside the project workspace: ${value}`);
}

export class ProjectManifestService {
  validate(manifest: ProjectManifest): string[] {
    const errors: string[] = [];
    if (manifest.schemaVersion !== 1) errors.push('Unsupported schemaVersion; expected 1');
    if (!manifest.name?.trim()) errors.push('Project name is required');
    if (!manifest.topModule?.trim()) errors.push('topModule is required');
    if (!manifest.sources?.length) errors.push('At least one HDL source is required');
    const seen = new Set<string>();
    for (const source of manifest.sources ?? []) {
      try { assertRelativeWorkspacePath(source, 'Source path'); } catch (err: any) { errors.push(err.message); }
      const key = source.replace(/\\/g, '/');
      if (seen.has(key)) errors.push(`Duplicate source: ${key}`);
      seen.add(key);
    }
    for (const inc of manifest.includeDirs ?? []) {
      try { assertRelativeWorkspacePath(inc, 'Include path'); } catch (err: any) { errors.push(err.message); }
    }
    const toolIds = new Set<string>();
    for (const tool of manifest.toolchain ?? []) {
      if (!tool.toolId.trim()) errors.push('Toolchain entry requires toolId');
      if (toolIds.has(tool.toolId)) errors.push(`Duplicate toolchain requirement: ${tool.toolId}`);
      toolIds.add(tool.toolId);
    }
    return errors;
  }

  loadJson(filePath: string): ProjectManifest {
    const manifest = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ProjectManifest;
    const errors = this.validate(manifest);
    if (errors.length) throw new Error(`Invalid project manifest: ${errors.join('; ')}`);
    return manifest;
  }

  digest(manifest: ProjectManifest): string {
    const errors = this.validate(manifest);
    if (errors.length) throw new Error(`Invalid project manifest: ${errors.join('; ')}`);
    return sha256(stableJson(manifest));
  }
}

export class ToolchainLockService {
  check(manifest: ProjectManifest, probes: ToolchainProbe[]): ToolchainCheck {
    const errors: string[] = [];
    const normalized = [...probes].sort((a, b) => a.toolId.localeCompare(b.toolId));
    const byId = new Map(normalized.map((probe) => [probe.toolId, probe]));
    for (const req of manifest.toolchain ?? []) {
      const probe = byId.get(req.toolId);
      if (!probe?.installed) {
        if (req.required !== false) errors.push(`Required tool '${req.toolId}' is not installed`);
        continue;
      }
      if (req.version && probe.version !== req.version) errors.push(`Tool '${req.toolId}' version mismatch: required ${req.version}, found ${probe.version ?? 'unknown'}`);
      if (req.runtimes?.length && probe.runtime && !req.runtimes.includes(probe.runtime)) errors.push(`Tool '${req.toolId}' runtime ${probe.runtime} is not allowed`);
    }
    return { valid: errors.length === 0, errors, normalized, digest: sha256(stableJson(normalized)) };
  }
}

export class ContentAddressedArtifactStore {
  constructor(private root: string) { fs.mkdirSync(root, { recursive: true }); }

  put(logicalName: string, data: string | Buffer, mediaType = 'application/octet-stream'): ArtifactRef {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const digest = sha256(buffer);
    const dir = path.join(this.root, 'sha256', digest.slice(0, 2));
    fs.mkdirSync(dir, { recursive: true });
    const blobPath = path.join(dir, digest);
    if (!fs.existsSync(blobPath)) {
      const temp = `${blobPath}.tmp-${process.pid}`;
      fs.writeFileSync(temp, buffer);
      fs.renameSync(temp, blobPath);
    }
    return { digest, size: buffer.length, mediaType, logicalName, createdAt: new Date().toISOString(), path: blobPath };
  }

  read(ref: ArtifactRef): Buffer {
    const data = fs.readFileSync(ref.path);
    if (sha256(data) !== ref.digest) throw new Error(`Artifact integrity failure for ${ref.logicalName}`);
    return data;
  }
}

export class RunLedger {
  private records = new Map<string, RunRecord>();
  private ledgerPath: string;
  constructor(private root: string) {
    fs.mkdirSync(root, { recursive: true });
    this.ledgerPath = path.join(root, 'runs.jsonl');
    if (fs.existsSync(this.ledgerPath)) {
      for (const line of fs.readFileSync(this.ledgerPath, 'utf-8').split(/\r?\n/).filter(Boolean)) {
        const record = JSON.parse(line) as RunRecord;
        this.records.set(record.id, record);
      }
    }
  }

  begin(input: Omit<RunRecord, 'id' | 'status' | 'startedAt' | 'artifacts'> & { kind: RunKind }): RunRecord {
    const seed = stableJson({ ...input, timestamp: new Date().toISOString(), nonce: this.records.size });
    const record: RunRecord = { ...input, id: sha256(seed).slice(0, 20), status: 'running', startedAt: new Date().toISOString(), artifacts: [] };
    this.records.set(record.id, record);
    this.append(record);
    return record;
  }

  finish(id: string, patch: Partial<Pick<RunRecord, 'status' | 'exitCode' | 'stdoutDigest' | 'stderrDigest' | 'runtime' | 'artifacts' | 'metadata'>>): RunRecord {
    const current = this.records.get(id);
    if (!current) throw new Error(`Unknown run: ${id}`);
    const next: RunRecord = { ...current, ...patch, completedAt: new Date().toISOString() };
    this.records.set(id, next);
    this.append(next);
    return next;
  }

  get(id: string): RunRecord | undefined { return this.records.get(id); }
  list(): RunRecord[] { return [...this.records.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt)); }
  private append(record: RunRecord): void { fs.appendFileSync(this.ledgerPath, `${JSON.stringify(record)}\n`, 'utf-8'); }
}

export class HashChainedAuditLog {
  private filePath: string;
  constructor(root: string) { fs.mkdirSync(root, { recursive: true }); this.filePath = path.join(root, 'audit.jsonl'); }

  append(input: Omit<AuditEvent, 'timestamp' | 'prevHash' | 'hash'>): AuditEvent {
    const entries = this.read();
    const prevHash = entries.at(-1)?.hash ?? 'GENESIS';
    const body = { ...input, timestamp: new Date().toISOString(), prevHash };
    const event: AuditEvent = { ...body, hash: sha256(stableJson(body)) };
    fs.appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, 'utf-8');
    return event;
  }

  read(): AuditEvent[] {
    if (!fs.existsSync(this.filePath)) return [];
    return fs.readFileSync(this.filePath, 'utf-8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as AuditEvent);
  }

  verify(): boolean {
    let previous = 'GENESIS';
    for (const event of this.read()) {
      if (event.prevHash !== previous) return false;
      const { hash, ...body } = event;
      if (sha256(stableJson(body)) !== hash) return false;
      previous = hash;
    }
    return true;
  }
}

export class SignoffPolicyEngine {
  evaluate(policy: SignoffPolicy, evidence: SignoffEvidence): SignoffDecision {
    const blockers: string[] = [];
    const warnings: string[] = [];
    const gate = (required: boolean | undefined, passed: boolean | undefined, name: string) => {
      if (!required) return;
      if (passed !== true) blockers.push(`${name} gate not satisfied`);
    };
    gate(policy.requireCompile, evidence.compilePassed, 'Compile');
    gate(policy.requireSimulation, evidence.simulationPassed, 'Simulation');
    gate(policy.requireFormal, evidence.formalPassed, 'Formal');
    gate(policy.requireSynthesis, evidence.synthesisPassed, 'Synthesis');
    if (policy.minCoveragePercent !== undefined && (evidence.coveragePercent ?? -1) < policy.minCoveragePercent) blockers.push(`Coverage below ${policy.minCoveragePercent}%`);
    if (policy.maxCdcIssues !== undefined && (evidence.cdcIssues ?? Number.POSITIVE_INFINITY) > policy.maxCdcIssues) blockers.push(`CDC issues exceed ${policy.maxCdcIssues}`);
    if (policy.maxUnconstrainedPaths !== undefined && (evidence.unconstrainedPaths ?? Number.POSITIVE_INFINITY) > policy.maxUnconstrainedPaths) blockers.push(`Unconstrained paths exceed ${policy.maxUnconstrainedPaths}`);
    if (policy.minWnsNs !== undefined && (evidence.wnsNs ?? Number.NEGATIVE_INFINITY) < policy.minWnsNs) blockers.push(`WNS below ${policy.minWnsNs} ns`);
    if (policy.requireTraceabilityPercent !== undefined && (evidence.traceabilityPercent ?? -1) < policy.requireTraceabilityPercent) blockers.push(`Traceability below ${policy.requireTraceabilityPercent}%`);
    if (policy.requireToolchainLock && evidence.toolchainLocked !== true) blockers.push('Toolchain is not locked');
    if (evidence.coveragePercent === undefined) warnings.push('Coverage evidence missing');
    if (evidence.wnsNs === undefined) warnings.push('Timing evidence missing');
    const total = blockers.length + warnings.length;
    const score = Math.max(0, Math.round(100 - blockers.length * 20 - warnings.length * 5 - Math.max(0, total - 8)));
    return { passed: blockers.length === 0, blockers, warnings, score };
  }
}

const ROLE_ACTIONS: Record<ProjectRole, ProjectAction[]> = {
  viewer: ['project:read', 'run:read'],
  engineer: ['project:read', 'project:write', 'run:read', 'run:execute'],
  lead: ['project:read', 'project:write', 'run:read', 'run:execute', 'signoff:approve', 'ai:cloud'],
  admin: ['project:read', 'project:write', 'run:read', 'run:execute', 'signoff:approve', 'ai:cloud', 'license:manage'],
};

export class RbacPolicy {
  can(role: ProjectRole, action: ProjectAction): boolean { return ROLE_ACTIONS[role].includes(action); }
  require(role: ProjectRole, action: ProjectAction): void { if (!this.can(role, action)) throw new Error(`Role '${role}' is not authorized for ${action}`); }
}

export class OfflineLicenseVerifier {
  constructor(private publicKeyPem: string) {}
  verify(license: SignedLicense, now = new Date()): LicenseDecision {
    try {
      const key = createPublicKey(this.publicKeyPem);
      const validSig = verifySignature(null, Buffer.from(stableJson(license.payload)), key, Buffer.from(license.signatureBase64, 'base64'));
      if (!validSig) return { valid: false, reason: 'Invalid license signature' };
      if (new Date(license.payload.expiresAt).getTime() <= now.getTime()) return { valid: false, reason: 'License expired' };
      return { valid: true, payload: license.payload };
    } catch (err: any) {
      return { valid: false, reason: err?.message || String(err) };
    }
  }
}

export class SecretRedactor {
  constructor(private extraPatterns: RegExp[] = []) {}
  redact(input: string): string {
    let out = input
      .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, '[REDACTED]')
      .replace(/\b(AKIA[0-9A-Z]{16})\b/g, '[REDACTED]')
      .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s]+/gi, '$1[REDACTED]')
      .replace(/((?:api[_-]?key|token|secret|password)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]');
    for (const pattern of this.extraPatterns) out = out.replace(pattern, '[REDACTED]');
    return out;
  }
}

export class ProductionProjectSession {
  readonly manifests = new ProjectManifestService();
  readonly toolchains = new ToolchainLockService();
  readonly signoff = new SignoffPolicyEngine();
  readonly rbac = new RbacPolicy();
  readonly artifacts: ContentAddressedArtifactStore;
  readonly runs: RunLedger;
  readonly audit: HashChainedAuditLog;
  readonly redactor = new SecretRedactor();
  readonly manifest: ProjectManifest;
  readonly projectDigest: string;

  constructor(readonly workspaceRoot: string, manifest: ProjectManifest) {
    const errors = this.manifests.validate(manifest);
    if (errors.length) throw new Error(`Invalid project manifest: ${errors.join('; ')}`);
    this.manifest = manifest;
    this.projectDigest = this.manifests.digest(manifest);
    const stateRoot = path.join(workspaceRoot, '.nayvid');
    this.artifacts = new ContentAddressedArtifactStore(path.join(stateRoot, 'artifacts'));
    this.runs = new RunLedger(path.join(stateRoot, 'runs'));
    this.audit = new HashChainedAuditLog(path.join(stateRoot, 'audit'));
  }

  readiness(probes: ToolchainProbe[], evidence: SignoffEvidence): ProductionReadinessReport {
    const toolchain = this.toolchains.check(this.manifest, probes);
    const signoff = this.signoff.evaluate(this.manifest.signoff ?? {}, { ...evidence, toolchainLocked: toolchain.valid });
    const blockers = [...toolchain.errors, ...signoff.blockers];
    return { projectValid: true, toolchainValid: toolchain.valid, auditValid: this.audit.verify(), signoff, blockers };
  }
}
