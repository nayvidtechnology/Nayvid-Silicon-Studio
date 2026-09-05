import { describe, it, expect } from 'vitest';
import { AgentVerificationHarness } from '../src/index.js';

describe('AgentVerificationHarness', () => {
  it('parses and validates silicon agent manifest', () => {
    const harness = new AgentVerificationHarness();
    const manifest = harness.parseManifest({
      apiVersion: 'nayvid.io/v1',
      kind: 'SiliconAgent',
      metadata: { id: 'timing.scout', version: '1.3.0' },
      spec: {
        level: 'scout',
        domain: 'timing',
        objective: ['identify_setup_root_cause'],
        models: { preferred: ['local-timing'], fallback: ['gpt-4o'] },
        dataPolicy: { allowed: ['timing_graph'], forbiddenForCloud: ['pdk'] },
        tools: { read: ['query_timing'], execute: ['run_sta'], forbidden: ['modify_rtl'] },
        authority: { proposeECO: true, executeECO: false },
        budgets: { maxToolRuns: 5, maxRuntimeMinutes: 30, maxModelCostUSD: 2 },
        invariants: ['no_latency_change'],
        hooks: { pre: ['IdentityHook'], post: ['CompileHook'] },
        rollback: { required: true },
        learning: { projectMemory: true, organizationPlaybook: true, weightUpdates: false },
      },
    });

    expect(manifest.metadata.id).toBe('timing.scout');
    expect(manifest.spec.level).toBe('scout');
  });

  it('runs pre and post hook chains and evaluates verification gates', async () => {
    const harness = new AgentVerificationHarness();
    const preResults = await harness.runPreHooks({
      agentId: 'timing.scout',
      action: 'inspect_path',
      inputs: {},
    });

    expect(preResults.every((r) => r.passed)).toBe(true);

    const postResults = await harness.runPostHooks({
      agentId: 'timing.scout',
      action: 'inspect_path',
      inputs: {},
      executionOutput: { path: 'execute/reg_a' },
    });

    expect(postResults.every((r) => r.passed)).toBe(true);

    const evalRes = harness.evaluateExecutionSuccess(preResults, postResults, { wnsNs: 0.02 });
    expect(evalRes.verified).toBe(true);
  });
});
