import { ManifestValidator } from './manifest.js';
import { PreHookChain, PostHookChain } from './hooks.js';
import { RollbackManager } from './rollback.js';
import type { SiliconAgentManifest, HookContext, PostHookContext, HookResult } from './types.js';

export class AgentVerificationHarness {
  private validator = new ManifestValidator();
  public preHookChain = new PreHookChain();
  public postHookChain = new PostHookChain();
  public rollbackManager = new RollbackManager();

  parseManifest(rawYamlOrObject: any): SiliconAgentManifest {
    return this.validator.validate(rawYamlOrObject);
  }

  async runPreHooks(ctx: HookContext, manifest?: SiliconAgentManifest): Promise<HookResult[]> {
    const list = manifest?.spec.hooks.pre;
    return this.preHookChain.run(ctx, list);
  }

  async runPostHooks(ctx: PostHookContext, manifest?: SiliconAgentManifest): Promise<HookResult[]> {
    const list = manifest?.spec.hooks.post;
    return this.postHookChain.run(ctx, list);
  }

  evaluateExecutionSuccess(
    preResults: HookResult[],
    postResults: HookResult[],
    metrics?: Record<string, any>
  ): { verified: boolean; failureReason?: string } {
    const failedPre = preResults.find((r) => !r.passed);
    if (failedPre) {
      return { verified: false, failureReason: `Pre-hook '${failedPre.hookName}' failed: ${failedPre.reason || 'Blocked'}` };
    }

    const failedPost = postResults.find((r) => !r.passed);
    if (failedPost) {
      return { verified: false, failureReason: `Post-hook '${failedPost.hookName}' failed: ${failedPost.reason || 'Failed'}` };
    }

    if (metrics && metrics.wnsNs !== undefined && metrics.wnsNs < -0.5) {
      return { verified: false, failureReason: `Verification hard gate failed: Negative slack threshold exceeded (WNS = ${metrics.wnsNs}ns)` };
    }

    return { verified: true };
  }
}

export * from './types.js';
export * from './manifest.js';
export * from './hooks.js';
export * from './rollback.js';
