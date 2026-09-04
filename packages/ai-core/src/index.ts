import type { ModelProvider } from '@nayvid/model-providers';
import type { DesignGraph } from '@nayvid/design-ir';

export type PrivacyPolicy = 'cloud-allowed' | 'ask-before-cloud' | 'local-only' | 'ai-disabled';

export interface WorkspaceContext {
  activeFile?: { path: string; content: string };
  designGraph?: DesignGraph;
  recentLogs?: string[];
}

export class ModelFabricRouter {
  private providers: Map<string, ModelProvider> = new Map();

  registerProvider(provider: ModelProvider): void {
    this.providers.set(provider.id, provider);
  }

  getProvider(id: string): ModelProvider | undefined {
    return this.providers.get(id);
  }

  selectProvider(policy: PrivacyPolicy, _requireVision: boolean = false): ModelProvider {
    if (policy === 'ai-disabled') {
      throw new Error('AI features are disabled by workspace privacy policy.');
    }

    if (policy === 'local-only') {
      const local = Array.from(this.providers.values()).find((p) => p.isLocal);
      if (!local) {
        throw new Error('No local model provider registered for local-only policy.');
      }
      return local;
    }

    const preferred = this.providers.get('openai') || Array.from(this.providers.values())[0];
    if (!preferred) {
      throw new Error('No AI model provider available.');
    }
    return preferred;
  }
}

export class ContextEngine {
  buildPromptContext(context: WorkspaceContext): string {
    const parts: string[] = [];

    if (context.activeFile) {
      parts.push(`=== Active File: ${context.activeFile.path} ===\n${context.activeFile.content}`);
    }

    if (context.designGraph) {
      const top = context.designGraph.modules[context.designGraph.topModule];
      if (top) {
        parts.push(`=== Design Graph Top Module: ${top.name} ===`);
        parts.push(`Ports: ${top.ports.map((p) => `${p.name} (${p.direction})`).join(', ')}`);
        parts.push(`Signals: ${top.signals.map((s) => s.name).join(', ')}`);
      }
    }

    if (context.recentLogs && context.recentLogs.length > 0) {
      parts.push(`=== Recent Logs ===\n${context.recentLogs.join('\n')}`);
    }

    return parts.join('\n\n');
  }
}

export * from './types.js';
