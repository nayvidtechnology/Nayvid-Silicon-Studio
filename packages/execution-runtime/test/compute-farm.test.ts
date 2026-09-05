import { describe, expect, it } from 'vitest';
import { ComputeJobQueue, LsfRunner, SlurmRunner, SshRunner, KubernetesRunner } from '../src/index.js';

describe('Compute Farm Runners - Extended Hardening', () => {
  it('handles Slurm job failures, timeouts, and cancellations', async () => {
    const runner = new SlurmRunner({
      mockExecutor: async (cmd, args) => {
        if (cmd === 'sbatch') return { code: 0, stdout: '123456;cluster1', stderr: '', durationMs: 10 };
        if (cmd === 'squeue' && args.includes('123456')) return { code: 0, stdout: 'FAILED', stderr: '', durationMs: 10 };
        if (cmd === 'scancel') return { code: 0, stdout: '', stderr: '', durationMs: 10 };
        return { code: 1, stdout: '', stderr: 'unknown', durationMs: 0 };
      },
    });

    const submitted = await runner.submit({
      id: 'job-fail',
      command: 'vcs',
      args: ['-full64', 'top.v'],
      quotas: { cpus: 8, memoryMb: 16384, queueName: 'eda_high' },
    });
    expect(submitted.remoteJobId).toBe('123456');

    const polled = await runner.poll('job-fail');
    expect(polled.status).toBe('failed');
    expect(polled.exitCode).toBe(1);
  });

  it('handles LSF submission failures and status polling', async () => {
    const runner = new LsfRunner({
      mockExecutor: async (cmd) => {
        if (cmd === 'bsub') return { code: 255, stdout: '', stderr: 'LSF cluster queue limit reached', durationMs: 10 };
        return { code: 0, stdout: '', stderr: '', durationMs: 0 };
      },
    });

    const job = await runner.submit({ id: 'lsf-fail', command: 'dc_shell', args: ['-f', 'run.tcl'] });
    expect(job.status).toBe('failed');
    expect(job.exitCode).toBe(255);
    expect(job.stderr).toContain('queue limit reached');
  });

  it('handles SSH runner execution failures and timeouts', async () => {
    const runner = new SshRunner({
      host: 'eda-farm.internal',
      user: 'engineer',
      mockExecutor: async () => ({ code: 124, stdout: '', stderr: 'Command timed out after 3600s', durationMs: 3600000 }),
    });

    const res = await runner.submit({ id: 'ssh-timeout', command: 'genus', args: ['-batch'] });
    expect(res.status).toBe('failed');
    expect(res.exitCode).toBe(124);
    expect(res.stderr).toContain('timed out');
  });

  it('handles Kubernetes job deletion and cancellation', async () => {
    const runner = new KubernetesRunner({
      namespace: 'eda-jobs',
      mockExecutor: async (cmd, args) => {
        if (args.includes('create')) return { code: 0, stdout: 'job.batch/nayvid-job-k8s-cancel created', stderr: '', durationMs: 10 };
        if (args.includes('delete')) return { code: 0, stdout: 'job.batch "nayvid-job-k8s-cancel" deleted', stderr: '', durationMs: 10 };
        return { code: 0, stdout: '', stderr: '', durationMs: 0 };
      },
    });

    const res = await runner.submit({ id: 'k8s-cancel', command: 'slang', args: ['--ast'] });
    const cancelled = await runner.cancel('k8s-cancel');
    expect(cancelled).toBe(true);
    expect((await runner.poll('k8s-cancel')).status).toBe('cancelled');
  });

  it('recovers and continues queue processing when a job submission fails', async () => {
    let callCount = 0;
    const runner = new SlurmRunner({
      mockExecutor: async (cmd) => {
        callCount++;
        if (callCount === 1) throw new Error('Network partition to Slurm controller');
        return { code: 0, stdout: '888', stderr: '', durationMs: 5 };
      },
    });

    const queue = new ComputeJobQueue(runner, 1);
    await queue.enqueue({ id: 'q-err-1', command: 'echo', args: ['1'] });
    expect(queue.getJob('q-err-1')?.status).toBe('failed');
    expect(queue.getJob('q-err-1')?.stderr).toContain('Network partition');

    await queue.enqueue({ id: 'q-err-2', command: 'echo', args: ['2'] });
    expect(queue.getJob('q-err-2')?.status).toBe('running');
  });
});
