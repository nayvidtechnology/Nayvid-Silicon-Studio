import * as path from 'path';
import {
  ProductionProjectSession,
  ProjectManifestService,
  type ArtifactRef,
  type ProjectRole,
  type RunKind,
  type RunRecord,
  type SignoffEvidence,
  type ToolchainProbe,
  type ProductionReadinessReport,
} from '@nayvid/platform-core';
import { SlangCliAdapter, type SlangElaborationResult } from '@nayvid/hdl-language/slang-cli';

interface ElaboratorLike {
  elaborate(request: {
    workspaceRoot: string;
    files: string[];
    topModule: string;
    includeDirs?: string[];
    defines?: Record<string, string | number | boolean>;
    parameters?: Record<string, string | number | boolean>;
  }): Promise<SlangElaborationResult>;
}

export class StudioProductionController {
  private session?: ProductionProjectSession;
  private manifestService = new ProjectManifestService();

  constructor(private elaborator: ElaboratorLike = new SlangCliAdapter()) {}

  openProject(manifestPath: string, actor = 'local-user'): ProductionProjectSession {
    const absolute = path.resolve(manifestPath);
    const manifest = this.manifestService.loadJson(absolute);
    this.session = new ProductionProjectSession(path.dirname(absolute), manifest);
    this.session.audit.append({ actor, action: 'project:open', resource: manifest.name, outcome: 'success', details: { manifestPath: path.basename(absolute), projectDigest: this.session.projectDigest } });
    return this.session;
  }

  getSession(): ProductionProjectSession {
    if (!this.session) throw new Error('No production project is open');
    return this.session;
  }

  async elaborate(role: ProjectRole, actor: string): Promise<SlangElaborationResult> {
    const session = this.getSession();
    session.rbac.require(role, 'run:execute');
    try {
      const result = await this.elaborator.elaborate({
        workspaceRoot: session.workspaceRoot,
        files: session.manifest.sources,
        topModule: session.manifest.topModule,
        includeDirs: session.manifest.includeDirs,
        defines: session.manifest.defines,
        parameters: session.manifest.parameters,
      });
      session.audit.append({ actor, action: 'slang:elaborate', resource: session.manifest.topModule, outcome: 'success', details: { runtime: result.runtimeUsed, astPath: path.relative(session.workspaceRoot, result.astPath).replace(/\\/g, '/') } });
      return result;
    } catch (err: any) {
      session.audit.append({ actor, action: 'slang:elaborate', resource: session.manifest.topModule, outcome: 'failure', details: { error: session.redactor.redact(err?.message || String(err)) } });
      throw err;
    }
  }

  beginRun(role: ProjectRole, actor: string, input: { kind: RunKind; toolchainDigest: string; command: string; args: string[]; cwd?: string }): RunRecord {
    const session = this.getSession();
    session.rbac.require(role, 'run:execute');
    const run = session.runs.begin({
      kind: input.kind,
      projectDigest: session.projectDigest,
      toolchainDigest: input.toolchainDigest,
      command: input.command,
      args: input.args,
      cwd: input.cwd ?? '.',
    });
    session.audit.append({ actor, action: 'run:begin', resource: run.id, outcome: 'success', details: { kind: run.kind, command: run.command } });
    return run;
  }

  attachEvidence(role: ProjectRole, actor: string, runId: string, logicalName: string, data: string | Buffer, mediaType = 'application/octet-stream'): ArtifactRef {
    const session = this.getSession();
    session.rbac.require(role, 'run:execute');
    const ref = session.artifacts.put(logicalName, typeof data === 'string' ? session.redactor.redact(data) : data, mediaType);
    const run = session.runs.get(runId);
    if (!run) throw new Error(`Unknown run: ${runId}`);
    session.runs.finish(runId, { status: run.status, artifacts: [...run.artifacts, ref] });
    session.audit.append({ actor, action: 'evidence:attach', resource: runId, outcome: 'success', details: { logicalName, digest: ref.digest } });
    return ref;
  }

  finishRun(role: ProjectRole, actor: string, runId: string, status: 'passed' | 'failed' | 'cancelled', exitCode?: number): RunRecord {
    const session = this.getSession();
    session.rbac.require(role, 'run:execute');
    const run = session.runs.finish(runId, { status, exitCode });
    session.audit.append({ actor, action: 'run:finish', resource: runId, outcome: status === 'passed' ? 'success' : 'failure', details: { status, exitCode } });
    return run;
  }

  readiness(role: ProjectRole, probes: ToolchainProbe[], evidence: SignoffEvidence): ProductionReadinessReport {
    const session = this.getSession();
    session.rbac.require(role, 'project:read');
    return session.readiness(probes, evidence);
  }

  approveSignoff(role: ProjectRole, actor: string, probes: ToolchainProbe[], evidence: SignoffEvidence): ProductionReadinessReport {
    const session = this.getSession();
    session.rbac.require(role, 'signoff:approve');
    const report = session.readiness(probes, evidence);
    session.audit.append({ actor, action: 'signoff:approve', resource: session.manifest.name, outcome: report.blockers.length ? 'denied' : 'success', details: { blockers: report.blockers, score: report.signoff.score } });
    if (report.blockers.length) throw new Error(`Signoff blocked: ${report.blockers.join('; ')}`);
    return report;
  }
}
