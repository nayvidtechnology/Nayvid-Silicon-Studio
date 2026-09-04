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
import { AgentToolGateway, type ToolResult } from '@nayvid/agent-tools';

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

interface ToolGatewayLike {
  executeTool(name: string, args: Record<string, any>, approved?: boolean): Promise<ToolResult>;
}

type ToolGatewayFactory = (workspaceRoot: string, allowedRuntimes?: Array<'native-windows' | 'wsl2' | 'linux' | 'docker'>) => ToolGatewayLike;

export class StudioProductionController {
  private session?: ProductionProjectSession;
  private manifestService = new ProjectManifestService();
  private gateway?: ToolGatewayLike;

  constructor(
    private elaborator: ElaboratorLike = new SlangCliAdapter(),
    private gatewayFactory: ToolGatewayFactory = (workspaceRoot, allowedRuntimes) => new AgentToolGateway(undefined, {
      workspaceRoot,
      allowedRuntimes,
      externalCommandAllowlist: ['git'],
      maxTimeoutMs: 10 * 60 * 1000,
    })
  ) {}

  openProject(manifestPath: string, actor = 'local-user'): ProductionProjectSession {
    const absolute = path.resolve(manifestPath);
    const manifest = this.manifestService.loadJson(absolute);
    this.session = new ProductionProjectSession(path.dirname(absolute), manifest);
    this.gateway = this.gatewayFactory(this.session.workspaceRoot, manifest.security?.allowedRuntimes);
    this.session.audit.append({ actor, action: 'project:open', resource: manifest.name, outcome: 'success', details: { manifestPath: path.basename(absolute), projectDigest: this.session.projectDigest } });
    return this.session;
  }

  getSession(): ProductionProjectSession {
    if (!this.session) throw new Error('No production project is open');
    return this.session;
  }

  private getGateway(): ToolGatewayLike {
    if (!this.gateway) throw new Error('No production project is open');
    return this.gateway;
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
      command: session.redactor.redact(input.command),
      args: input.args.map((arg) => session.redactor.redact(arg)),
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
    session.runs.update(runId, { artifacts: [...run.artifacts, ref] });
    session.audit.append({ actor, action: 'evidence:attach', resource: runId, outcome: 'success', details: { logicalName, digest: ref.digest } });
    return ref;
  }

  finishRun(role: ProjectRole, actor: string, runId: string, status: 'passed' | 'failed' | 'cancelled', exitCode?: number): RunRecord {
    const session = this.getSession();
    session.rbac.require(role, 'run:execute');
    const run = session.runs.finish(runId, { status, exitCode });
    session.audit.append({ actor, action: 'run:finish', resource: runId, outcome: status === 'passed' ? 'success' : status === 'cancelled' ? 'denied' : 'failure', details: { status, exitCode } });
    return run;
  }

  async executeEvidenceRun(role: ProjectRole, actor: string, input: {
    kind: RunKind;
    toolchainDigest: string;
    toolName: string;
    toolArgs: Record<string, any>;
    approved?: boolean;
  }): Promise<{ run: RunRecord; result: ToolResult; evidence: ArtifactRef }> {
    const session = this.getSession();
    const run = this.beginRun(role, actor, {
      kind: input.kind,
      toolchainDigest: input.toolchainDigest,
      command: `agent:${input.toolName}`,
      args: [JSON.stringify(input.toolArgs)],
    });

    const result = await this.getGateway().executeTool(input.toolName, input.toolArgs, input.approved ?? false);
    const evidenceBody = JSON.stringify({
      toolName: input.toolName,
      success: result.success,
      output: result.output,
      error: result.error,
      runtimeUsed: result.runtimeUsed,
      exitCode: result.exitCode,
    }, null, 2);
    const evidence = this.attachEvidence(role, actor, run.id, `${input.kind}-${run.id}.json`, evidenceBody, 'application/json');
    const concreteRuntime = result.runtimeUsed && result.runtimeUsed !== 'auto' ? result.runtimeUsed : undefined;
    session.runs.update(run.id, {
      runtime: concreteRuntime,
      stdoutDigest: result.success ? evidence.digest : undefined,
      stderrDigest: result.success ? undefined : evidence.digest,
    });
    const status = result.success ? 'passed' : result.requiresApproval ? 'cancelled' : 'failed';
    const finished = this.finishRun(role, actor, run.id, status, result.exitCode);
    return { run: finished, result, evidence };
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
