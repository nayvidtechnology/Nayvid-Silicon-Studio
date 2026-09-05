import type { HookContext, HookResult, PostHookContext } from './types.js';

export class PreHookChain {
  private hooks: Map<string, (ctx: HookContext) => Promise<HookResult>> = new Map();

  constructor() {
    this.registerHook('IdentityHook', async () => ({ passed: true, hookName: 'IdentityHook' }));
    this.registerHook('RBACHook', async () => ({ passed: true, hookName: 'RBACHook' }));
    this.registerHook('ProjectScopeHook', async () => ({ passed: true, hookName: 'ProjectScopeHook' }));
    this.registerHook('DataClassificationHook', async (ctx) => {
      if (ctx.dataClassification === 'PDK_RESTRICTED' && ctx.inputs?.isCloudCall) {
        return { passed: false, hookName: 'DataClassificationHook', reason: 'PDK_RESTRICTED data cannot egress to cloud model.' };
      }
      return { passed: true, hookName: 'DataClassificationHook' };
    });
    this.registerHook('ToolchainLockHook', async () => ({ passed: true, hookName: 'ToolchainLockHook' }));
    this.registerHook('PDKVersionHook', async () => ({ passed: true, hookName: 'PDKVersionHook' }));
    this.registerHook('ArtifactFreshnessHook', async () => ({ passed: true, hookName: 'ArtifactFreshnessHook' }));
    this.registerHook('InvariantHook', async () => ({ passed: true, hookName: 'InvariantHook' }));
    this.registerHook('ComputeBudgetHook', async () => ({ passed: true, hookName: 'ComputeBudgetHook' }));
    this.registerHook('LicenseBudgetHook', async () => ({ passed: true, hookName: 'LicenseBudgetHook' }));
    this.registerHook('ModelPrivacyHook', async () => ({ passed: true, hookName: 'ModelPrivacyHook' }));
    this.registerHook('ContextCompilerHook', async () => ({ passed: true, hookName: 'ContextCompilerHook' }));
    this.registerHook('ExecutionCheckpointHook', async (ctx) => ({ passed: true, hookName: 'ExecutionCheckpointHook', modifiedInputs: { ...ctx.inputs, checkpointCreated: true } }));
  }

  registerHook(name: string, fn: (ctx: HookContext) => Promise<HookResult>): void {
    this.hooks.set(name, fn);
  }

  async run(ctx: HookContext, hookNames?: string[]): Promise<HookResult[]> {
    const list = hookNames || Array.from(this.hooks.keys());
    const results: HookResult[] = [];
    for (const name of list) {
      const fn = this.hooks.get(name);
      if (fn) {
        const res = await fn(ctx);
        results.push(res);
        if (!res.passed) {
          break;
        }
      }
    }
    return results;
  }
}

export class PostHookChain {
  private hooks: Map<string, (ctx: PostHookContext) => Promise<HookResult>> = new Map();

  constructor() {
    this.registerHook('ToolOutputParser', async () => ({ passed: true, hookName: 'ToolOutputParser' }));
    this.registerHook('ArtifactIntegrityHook', async () => ({ passed: true, hookName: 'ArtifactIntegrityHook' }));
    this.registerHook('CompileHook', async () => ({ passed: true, hookName: 'CompileHook' }));
    this.registerHook('LintHook', async () => ({ passed: true, hookName: 'LintHook' }));
    this.registerHook('CDC_RDCHook', async () => ({ passed: true, hookName: 'CDC_RDCHook' }));
    this.registerHook('FormalHook', async () => ({ passed: true, hookName: 'FormalHook' }));
    this.registerHook('RegressionHook', async () => ({ passed: true, hookName: 'RegressionHook' }));
    this.registerHook('QoRComparisonHook', async () => ({ passed: true, hookName: 'QoRComparisonHook' }));
    this.registerHook('KnowledgeGraphUpdate', async () => ({ passed: true, hookName: 'KnowledgeGraphUpdate' }));
    this.registerHook('EvidenceLedgerHook', async () => ({ passed: true, hookName: 'EvidenceLedgerHook' }));
    this.registerHook('AuditHook', async () => ({ passed: true, hookName: 'AuditHook' }));
    this.registerHook('LearningHook', async () => ({ passed: true, hookName: 'LearningHook' }));
    this.registerHook('ConvergenceHook', async () => ({ passed: true, hookName: 'ConvergenceHook' }));
  }

  registerHook(name: string, fn: (ctx: PostHookContext) => Promise<HookResult>): void {
    this.hooks.set(name, fn);
  }

  async run(ctx: PostHookContext, hookNames?: string[]): Promise<HookResult[]> {
    const list = hookNames || Array.from(this.hooks.keys());
    const results: HookResult[] = [];
    for (const name of list) {
      const fn = this.hooks.get(name);
      if (fn) {
        const res = await fn(ctx);
        results.push(res);
        if (!res.passed) {
          break;
        }
      }
    }
    return results;
  }
}
