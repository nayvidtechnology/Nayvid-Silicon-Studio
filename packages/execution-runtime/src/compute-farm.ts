import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ExecResult } from './types.js';

const execFileAsync = promisify(execFile);

export type ComputeFarmType = 'slurm' | 'lsf' | 'ssh' | 'k8s' | 'local';

export interface ResourceQuotas {
  cpus?: number;
  memoryMb?: number;
  walltimeSec?: number;
  queueName?: string;
  nodeLabels?: Record<string, string>;
}

export interface ComputeJobSpec {
  id: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  quotas?: ResourceQuotas;
}

export type ComputeJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ComputeJobState {
  id: string;
  status: ComputeJobStatus;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  remoteJobId?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ComputeFarmRunner {
  readonly type: ComputeFarmType;
  submit(spec: ComputeJobSpec): Promise<ComputeJobState>;
  poll(jobId: string): Promise<ComputeJobState>;
  cancel(jobId: string): Promise<boolean>;
}

export interface SlurmRunnerOptions {
  sbatchPath?: string;
  squeuePath?: string;
  scancelPath?: string;
  defaultQueue?: string;
  mockExecutor?: (cmd: string, args: string[]) => Promise<ExecResult>;
}

export class SlurmRunner implements ComputeFarmRunner {
  readonly type: ComputeFarmType = 'slurm';
  private jobs = new Map<string, ComputeJobState>();
  private sbatchPath: string;
  private squeuePath: string;
  private scancelPath: string;
  private mockExecutor?: (cmd: string, args: string[]) => Promise<ExecResult>;

  constructor(options: SlurmRunnerOptions = {}) {
    this.sbatchPath = options.sbatchPath ?? 'sbatch';
    this.squeuePath = options.squeuePath ?? 'squeue';
    this.scancelPath = options.scancelPath ?? 'scancel';
    this.mockExecutor = options.mockExecutor;
  }

  private async runCmd(cmd: string, args: string[]): Promise<ExecResult> {
    if (this.mockExecutor) return this.mockExecutor(cmd, args);
    try {
      const { stdout, stderr } = await execFileAsync(cmd, args);
      return { code: 0, stdout: stdout.toString(), stderr: stderr.toString(), durationMs: 0 };
    } catch (err: any) {
      return { code: err.code ?? 1, stdout: err.stdout?.toString() ?? '', stderr: err.stderr?.toString() ?? err.message, durationMs: 0 };
    }
  }

  async submit(spec: ComputeJobSpec): Promise<ComputeJobState> {
    const sbatchArgs: string[] = ['--parsable'];
    if (spec.quotas?.queueName) sbatchArgs.push('-p', spec.quotas.queueName);
    if (spec.quotas?.cpus) sbatchArgs.push('-c', String(spec.quotas.cpus));
    if (spec.quotas?.memoryMb) sbatchArgs.push(`--mem=${spec.quotas.memoryMb}M`);
    if (spec.quotas?.walltimeSec) sbatchArgs.push(`--time=${Math.ceil(spec.quotas.walltimeSec / 60)}`);
    sbatchArgs.push('--wrap', `${spec.command} ${spec.args.join(' ')}`);

    const res = await this.runCmd(this.sbatchPath, sbatchArgs);
    const remoteJobId = res.code === 0 ? res.stdout.trim().split(';')[0] : `slurm-${Date.now()}`;
    const state: ComputeJobState = {
      id: spec.id,
      status: res.code === 0 ? 'running' : 'failed',
      remoteJobId,
      startedAt: new Date().toISOString(),
      stdout: res.stdout,
      stderr: res.stderr,
      exitCode: res.code,
    };
    this.jobs.set(spec.id, state);
    return state;
  }

  async poll(jobId: string): Promise<ComputeJobState> {
    const current = this.jobs.get(jobId);
    if (!current) throw new Error(`Unknown job: ${jobId}`);
    if (['completed', 'failed', 'cancelled'].includes(current.status)) return current;

    if (current.remoteJobId) {
      const res = await this.runCmd(this.squeuePath, ['-j', current.remoteJobId, '-h', '-o', '%T']);
      const stateStr = res.stdout.trim().toUpperCase();
      if (res.code !== 0 || !stateStr) {
        current.status = 'completed';
        current.completedAt = new Date().toISOString();
        current.exitCode = 0;
      } else if (stateStr === 'PENDING') {
        current.status = 'queued';
      } else if (stateStr === 'RUNNING') {
        current.status = 'running';
      } else if (['FAILED', 'CANCELLED', 'TIMEOUT', 'NODE_FAIL'].includes(stateStr)) {
        current.status = stateStr === 'CANCELLED' ? 'cancelled' : 'failed';
        current.completedAt = new Date().toISOString();
        current.exitCode = 1;
      }
    }
    return current;
  }

  async cancel(jobId: string): Promise<boolean> {
    const current = this.jobs.get(jobId);
    if (!current) return false;
    if (current.remoteJobId && ['queued', 'running'].includes(current.status)) {
      await this.runCmd(this.scancelPath, [current.remoteJobId]);
      current.status = 'cancelled';
      current.completedAt = new Date().toISOString();
      current.exitCode = 130;
      return true;
    }
    return false;
  }
}

export interface LsfRunnerOptions {
  bsubPath?: string;
  bjobsPath?: string;
  bkillPath?: string;
  mockExecutor?: (cmd: string, args: string[]) => Promise<ExecResult>;
}

export class LsfRunner implements ComputeFarmRunner {
  readonly type: ComputeFarmType = 'lsf';
  private jobs = new Map<string, ComputeJobState>();
  private bsubPath: string;
  private bjobsPath: string;
  private bkillPath: string;
  private mockExecutor?: (cmd: string, args: string[]) => Promise<ExecResult>;

  constructor(options: LsfRunnerOptions = {}) {
    this.bsubPath = options.bsubPath ?? 'bsub';
    this.bjobsPath = options.bjobsPath ?? 'bjobs';
    this.bkillPath = options.bkillPath ?? 'bkill';
    this.mockExecutor = options.mockExecutor;
  }

  private async runCmd(cmd: string, args: string[]): Promise<ExecResult> {
    if (this.mockExecutor) return this.mockExecutor(cmd, args);
    try {
      const { stdout, stderr } = await execFileAsync(cmd, args);
      return { code: 0, stdout: stdout.toString(), stderr: stderr.toString(), durationMs: 0 };
    } catch (err: any) {
      return { code: err.code ?? 1, stdout: err.stdout?.toString() ?? '', stderr: err.stderr?.toString() ?? err.message, durationMs: 0 };
    }
  }

  async submit(spec: ComputeJobSpec): Promise<ComputeJobState> {
    const bsubArgs: string[] = [];
    if (spec.quotas?.queueName) bsubArgs.push('-q', spec.quotas.queueName);
    if (spec.quotas?.cpus) bsubArgs.push('-n', String(spec.quotas.cpus));
    if (spec.quotas?.memoryMb) bsubArgs.push('-M', String(spec.quotas.memoryMb));
    bsubArgs.push(`${spec.command} ${spec.args.join(' ')}`);

    const res = await this.runCmd(this.bsubPath, bsubArgs);
    const match = res.stdout.match(/Job <(\d+)>/);
    const remoteJobId = match ? match[1] : `lsf-${Date.now()}`;
    const state: ComputeJobState = {
      id: spec.id,
      status: res.code === 0 ? 'running' : 'failed',
      remoteJobId,
      startedAt: new Date().toISOString(),
      stdout: res.stdout,
      stderr: res.stderr,
      exitCode: res.code,
    };
    this.jobs.set(spec.id, state);
    return state;
  }

  async poll(jobId: string): Promise<ComputeJobState> {
    const current = this.jobs.get(jobId);
    if (!current) throw new Error(`Unknown job: ${jobId}`);
    if (['completed', 'failed', 'cancelled'].includes(current.status)) return current;

    if (current.remoteJobId) {
      const res = await this.runCmd(this.bjobsPath, ['-noheader', '-o', 'stat', current.remoteJobId]);
      const statusStr = res.stdout.trim().toUpperCase();
      if (res.code !== 0 || !statusStr) {
        current.status = 'completed';
        current.completedAt = new Date().toISOString();
      } else if (statusStr === 'PEND') {
        current.status = 'queued';
      } else if (statusStr === 'RUN') {
        current.status = 'running';
      } else if (['EXIT', 'DONE'].includes(statusStr)) {
        current.status = statusStr === 'DONE' ? 'completed' : 'failed';
        current.completedAt = new Date().toISOString();
      }
    }
    return current;
  }

  async cancel(jobId: string): Promise<boolean> {
    const current = this.jobs.get(jobId);
    if (!current) return false;
    if (current.remoteJobId && ['queued', 'running'].includes(current.status)) {
      await this.runCmd(this.bkillPath, [current.remoteJobId]);
      current.status = 'cancelled';
      current.completedAt = new Date().toISOString();
      return true;
    }
    return false;
  }
}

export interface SshRunnerOptions {
  host: string;
  user?: string;
  keyPath?: string;
  port?: number;
  remoteWorkspaceRoot?: string;
  mockExecutor?: (cmd: string, args: string[]) => Promise<ExecResult>;
}

export class SshRunner implements ComputeFarmRunner {
  readonly type: ComputeFarmType = 'ssh';
  private jobs = new Map<string, ComputeJobState>();
  private host: string;
  private user?: string;
  private keyPath?: string;
  private port?: number;
  private mockExecutor?: (cmd: string, args: string[]) => Promise<ExecResult>;

  constructor(options: SshRunnerOptions) {
    this.host = options.host;
    this.user = options.user;
    this.keyPath = options.keyPath;
    this.port = options.port;
    this.mockExecutor = options.mockExecutor;
  }

  private async runCmd(cmd: string, args: string[]): Promise<ExecResult> {
    if (this.mockExecutor) return this.mockExecutor(cmd, args);
    try {
      const { stdout, stderr } = await execFileAsync(cmd, args);
      return { code: 0, stdout: stdout.toString(), stderr: stderr.toString(), durationMs: 0 };
    } catch (err: any) {
      return { code: err.code ?? 1, stdout: err.stdout?.toString() ?? '', stderr: err.stderr?.toString() ?? err.message, durationMs: 0 };
    }
  }

  async submit(spec: ComputeJobSpec): Promise<ComputeJobState> {
    const sshTarget = this.user ? `${this.user}@${this.host}` : this.host;
    const sshArgs: string[] = [];
    if (this.port) sshArgs.push('-p', String(this.port));
    if (this.keyPath) sshArgs.push('-i', this.keyPath);
    sshArgs.push(sshTarget, `${spec.command} ${spec.args.join(' ')}`);

    const res = await this.runCmd('ssh', sshArgs);
    const state: ComputeJobState = {
      id: spec.id,
      status: res.code === 0 ? 'completed' : 'failed',
      exitCode: res.code,
      stdout: res.stdout,
      stderr: res.stderr,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    this.jobs.set(spec.id, state);
    return state;
  }

  async poll(jobId: string): Promise<ComputeJobState> {
    const current = this.jobs.get(jobId);
    if (!current) throw new Error(`Unknown job: ${jobId}`);
    return current;
  }

  async cancel(jobId: string): Promise<boolean> {
    const current = this.jobs.get(jobId);
    if (!current) return false;
    if (['queued', 'running'].includes(current.status)) {
      current.status = 'cancelled';
      current.completedAt = new Date().toISOString();
      return true;
    }
    return false;
  }
}

export interface KubernetesRunnerOptions {
  kubectlPath?: string;
  namespace?: string;
  mockExecutor?: (cmd: string, args: string[]) => Promise<ExecResult>;
}

export class KubernetesRunner implements ComputeFarmRunner {
  readonly type: ComputeFarmType = 'k8s';
  private jobs = new Map<string, ComputeJobState>();
  private kubectlPath: string;
  private namespace: string;
  private mockExecutor?: (cmd: string, args: string[]) => Promise<ExecResult>;

  constructor(options: KubernetesRunnerOptions = {}) {
    this.kubectlPath = options.kubectlPath ?? 'kubectl';
    this.namespace = options.namespace ?? 'default';
    this.mockExecutor = options.mockExecutor;
  }

  private async runCmd(cmd: string, args: string[]): Promise<ExecResult> {
    if (this.mockExecutor) return this.mockExecutor(cmd, args);
    try {
      const { stdout, stderr } = await execFileAsync(cmd, args);
      return { code: 0, stdout: stdout.toString(), stderr: stderr.toString(), durationMs: 0 };
    } catch (err: any) {
      return { code: err.code ?? 1, stdout: err.stdout?.toString() ?? '', stderr: err.stderr?.toString() ?? err.message, durationMs: 0 };
    }
  }

  async submit(spec: ComputeJobSpec): Promise<ComputeJobState> {
    const jobName = `nayvid-job-${spec.id.toLowerCase().replace(/[^a-z0-9-]/g, '')}`;
    const args = ['create', 'job', jobName, `--image=nayvid/eda-runner:latest`, `-n`, this.namespace, '--', spec.command, ...spec.args];
    const res = await this.runCmd(this.kubectlPath, args);

    const state: ComputeJobState = {
      id: spec.id,
      status: res.code === 0 ? 'running' : 'failed',
      remoteJobId: jobName,
      startedAt: new Date().toISOString(),
      stdout: res.stdout,
      stderr: res.stderr,
      exitCode: res.code,
    };
    this.jobs.set(spec.id, state);
    return state;
  }

  async poll(jobId: string): Promise<ComputeJobState> {
    const current = this.jobs.get(jobId);
    if (!current) throw new Error(`Unknown job: ${jobId}`);
    if (['completed', 'failed', 'cancelled'].includes(current.status)) return current;

    if (current.remoteJobId) {
      const res = await this.runCmd(this.kubectlPath, ['get', 'job', current.remoteJobId, '-n', this.namespace, '-o', 'jsonpath={.status.succeeded}']);
      if (res.stdout.trim() === '1') {
        current.status = 'completed';
        current.completedAt = new Date().toISOString();
        current.exitCode = 0;
      }
    }
    return current;
  }

  async cancel(jobId: string): Promise<boolean> {
    const current = this.jobs.get(jobId);
    if (!current) return false;
    if (current.remoteJobId && ['queued', 'running'].includes(current.status)) {
      await this.runCmd(this.kubectlPath, ['delete', 'job', current.remoteJobId, '-n', this.namespace]);
      current.status = 'cancelled';
      current.completedAt = new Date().toISOString();
      return true;
    }
    return false;
  }
}

export class ComputeJobQueue {
  private queue: ComputeJobSpec[] = [];
  private active = new Map<string, ComputeJobState>();
  private completed = new Map<string, ComputeJobState>();

  constructor(
    private runner: ComputeFarmRunner,
    private maxConcurrency = 4
  ) {}

  async enqueue(spec: ComputeJobSpec): Promise<ComputeJobState> {
    this.queue.push(spec);
    await this.processQueue();
    return this.getJob(spec.id) ?? { id: spec.id, status: 'queued' };
  }

  async cancel(jobId: string): Promise<boolean> {
    const queueIndex = this.queue.findIndex((item) => item.id === jobId);
    if (queueIndex >= 0) {
      const [spec] = this.queue.splice(queueIndex, 1);
      const state: ComputeJobState = { id: spec.id, status: 'cancelled', completedAt: new Date().toISOString() };
      this.completed.set(jobId, state);
      return true;
    }
    if (this.active.has(jobId)) {
      const cancelled = await this.runner.cancel(jobId);
      if (cancelled) {
        const state = this.active.get(jobId)!;
        state.status = 'cancelled';
        state.completedAt = new Date().toISOString();
        this.active.delete(jobId);
        this.completed.set(jobId, state);
        await this.processQueue();
      }
      return cancelled;
    }
    return false;
  }

  getJob(jobId: string): ComputeJobState | undefined {
    const queuedSpec = this.queue.find((item) => item.id === jobId);
    if (queuedSpec) return { id: jobId, status: 'queued' };
    return this.active.get(jobId) ?? this.completed.get(jobId);
  }

  async processQueue(): Promise<void> {
    while (this.active.size < this.maxConcurrency && this.queue.length > 0) {
      const spec = this.queue.shift()!;
      try {
        const state = await this.runner.submit(spec);
        this.active.set(spec.id, state);
        if (['completed', 'failed', 'cancelled'].includes(state.status)) {
          this.active.delete(spec.id);
          this.completed.set(spec.id, state);
        }
      } catch (err: any) {
        const state: ComputeJobState = {
          id: spec.id,
          status: 'failed',
          stderr: err?.message || String(err),
          completedAt: new Date().toISOString(),
        };
        this.completed.set(spec.id, state);
      }
    }
  }

  async pollAll(): Promise<ComputeJobState[]> {
    for (const [id] of this.active) {
      const updated = await this.runner.poll(id);
      this.active.set(id, updated);
      if (['completed', 'failed', 'cancelled'].includes(updated.status)) {
        this.active.delete(id);
        this.completed.set(id, updated);
      }
    }
    return [
      ...this.queue.map((item) => ({ id: item.id, status: 'queued' as const })),
      ...this.active.values(),
      ...this.completed.values(),
    ];
  }
}
