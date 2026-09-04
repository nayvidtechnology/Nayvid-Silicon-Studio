import * as fs from 'fs';
import * as path from 'path';
import type { AuditEvent, ProjectManifest, RunRecord, SignoffDecision, ToolchainCheck, ToolchainProbe } from './types.js';
import { sha256, stableJson } from './index.js';

export interface SourceSnapshotEntry { path: string; digest: string; size: number; }
export interface SourceSnapshot { files: SourceSnapshotEntry[]; digest: string; }
export interface ToolchainLockFile { schemaVersion: 1; probes: ToolchainProbe[]; digest: string; createdAt: string; }
export interface EvidenceBundle {
  schemaVersion: 1;
  projectDigest: string;
  sourceSnapshot: SourceSnapshot;
  toolchainDigest: string;
  runs: RunRecord[];
  auditHead: string;
  signoff: SignoffDecision;
  createdAt: string;
  digest: string;
}

function resolveInside(root: string, input: string): string {
  const absolute = path.resolve(root, input);
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Path escapes workspace: ${input}`);
  return absolute;
}

export class SourceSnapshotService {
  snapshot(workspaceRoot: string, manifest: ProjectManifest): SourceSnapshot {
    const files = [...manifest.sources].sort().map((source) => {
      const absolute = resolveInside(workspaceRoot, source);
      if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error(`Source file missing: ${source}`);
      const data = fs.readFileSync(absolute);
      return { path: source.replace(/\\/g, '/'), digest: sha256(data), size: data.length };
    });
    return { files, digest: sha256(stableJson(files)) };
  }

  verify(workspaceRoot: string, snapshot: SourceSnapshot): boolean {
    for (const entry of snapshot.files) {
      const absolute = resolveInside(workspaceRoot, entry.path);
      if (!fs.existsSync(absolute)) return false;
      const data = fs.readFileSync(absolute);
      if (data.length !== entry.size || sha256(data) !== entry.digest) return false;
    }
    return sha256(stableJson(snapshot.files)) === snapshot.digest;
  }
}

export class ToolchainLockFileService {
  write(filePath: string, check: ToolchainCheck): ToolchainLockFile {
    if (!check.valid) throw new Error(`Cannot lock invalid toolchain: ${check.errors.join('; ')}`);
    const lock: ToolchainLockFile = { schemaVersion: 1, probes: check.normalized, digest: check.digest, createdAt: new Date().toISOString() };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temp = `${filePath}.tmp-${process.pid}`;
    fs.writeFileSync(temp, `${JSON.stringify(lock, null, 2)}\n`, 'utf-8');
    fs.renameSync(temp, filePath);
    return lock;
  }

  read(filePath: string): ToolchainLockFile {
    const lock = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ToolchainLockFile;
    if (lock.schemaVersion !== 1) throw new Error('Unsupported toolchain lock schema');
    const expected = sha256(stableJson([...lock.probes].sort((a, b) => a.toolId.localeCompare(b.toolId))));
    if (expected !== lock.digest) throw new Error('Toolchain lock integrity failure');
    return lock;
  }
}

export class EvidenceBundleBuilder {
  build(input: {
    projectDigest: string;
    sourceSnapshot: SourceSnapshot;
    toolchain: ToolchainCheck;
    runs: RunRecord[];
    audit: AuditEvent[];
    signoff: SignoffDecision;
  }): EvidenceBundle {
    if (!input.toolchain.valid) throw new Error('Cannot build signoff evidence bundle from invalid toolchain');
    if (!input.signoff.passed) throw new Error('Cannot build signoff evidence bundle before signoff gates pass');
    const terminalRuns = input.runs.filter((run) => ['passed', 'failed', 'cancelled'].includes(run.status));
    if (terminalRuns.length !== input.runs.length) throw new Error('Cannot bundle non-terminal runs');
    const auditHead = input.audit.at(-1)?.hash ?? 'GENESIS';
    const base = {
      schemaVersion: 1 as const,
      projectDigest: input.projectDigest,
      sourceSnapshot: input.sourceSnapshot,
      toolchainDigest: input.toolchain.digest,
      runs: [...input.runs].sort((a, b) => a.id.localeCompare(b.id)),
      auditHead,
      signoff: input.signoff,
      createdAt: new Date().toISOString(),
    };
    return { ...base, digest: sha256(stableJson(base)) };
  }

  verify(bundle: EvidenceBundle): boolean {
    const { digest, ...base } = bundle;
    return sha256(stableJson(base)) === digest;
  }
}
