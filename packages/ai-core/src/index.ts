import type { ModelProvider } from '@nayvid/model-providers';
import type { DesignGraph } from '@nayvid/design-ir';
import type { NaviSkill, AgentActivityItem } from './types.js';

export type PrivacyPolicy = 'cloud-allowed' | 'ask-before-cloud' | 'local-only' | 'ai-disabled';

export interface WorkspaceContext {
  activeFile?: { path: string; content: string };
  designGraph?: DesignGraph;
  recentLogs?: string[];
  selectedSignal?: string;
}

export class ModelFabricRouter {
  private providers: Map<string, ModelProvider> = new Map();

  registerProvider(provider: ModelProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregisterProvider(id: string): void {
    this.providers.delete(id);
  }

  getProvider(id: string): ModelProvider | undefined {
    return this.providers.get(id);
  }

  getProviders(): ModelProvider[] {
    return Array.from(this.providers.values());
  }

  selectProvider(
    policy: PrivacyPolicy,
    requireVision: boolean = false,
    cloudApproved: boolean = false,
    preferredProviderId?: string
  ): ModelProvider {
    if (policy === 'ai-disabled') throw new Error('AI features are disabled by workspace privacy policy.');

    const candidates = this.getProviders().filter((p) => !requireVision || p.supportsVision);
    if (candidates.length === 0) throw new Error(requireVision ? 'No vision-capable AI provider is available.' : 'No AI model provider available.');

    const preferred = preferredProviderId ? candidates.find((p) => p.id === preferredProviderId) : undefined;

    if (policy === 'local-only') {
      const local = preferred?.isLocal ? preferred : candidates.find((p) => p.isLocal);
      if (!local) throw new Error('No local model provider registered for local-only policy.');
      return local;
    }

    if (policy === 'ask-before-cloud' && !cloudApproved) {
      const local = preferred?.isLocal ? preferred : candidates.find((p) => p.isLocal);
      if (local) return local;
      throw new Error('Cloud model use requires explicit approval for this workspace request.');
    }

    if (preferred) {
      if (!preferred.isLocal && policy === 'ask-before-cloud' && !cloudApproved) {
        throw new Error(`Cloud provider '${preferred.id}' requires explicit approval.`);
      }
      return preferred;
    }

    return candidates.find((p) => p.id === 'openai') || candidates[0];
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
        parts.push(`Ports: ${top.ports.map((p) => `${p.name} (${p.direction}, ${p.width}b)`).join(', ')}`);
        parts.push(`Signals: ${top.signals.map((s) => `${s.name}${s.dependsOn?.length ? ` <- ${s.dependsOn.join('|')}` : ''}`).join(', ')}`);
        if (top.instances.length) parts.push(`Instances: ${top.instances.map((i) => `${i.name}:${i.moduleName}`).join(', ')}`);
        if (top.fsms.length) parts.push(`FSMs: ${top.fsms.map((f) => `${f.name}[${f.states.map((s) => s.name).join('|')}]`).join(', ')}`);
        if (top.clockDomains.length) parts.push(`Clock domains: ${top.clockDomains.join(', ')}`);
        if (top.resetDomains.length) parts.push(`Reset domains: ${top.resetDomains.join(', ')}`);
      }
    }

    if (context.selectedSignal) parts.push(`=== Selected Signal ===\n${context.selectedSignal}`);
    if (context.recentLogs?.length) parts.push(`=== Recent Logs ===\n${context.recentLogs.join('\n')}`);

    return parts.join('\n\n');
  }
}

export class AgentTimelineTracker {
  private timeline: AgentActivityItem[] = [];

  addActivity(item: Omit<AgentActivityItem, 'id' | 'timestamp'>): AgentActivityItem {
    const fullItem: AgentActivityItem = {
      ...item,
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    this.timeline.push(fullItem);
    return fullItem;
  }

  updateActivity(id: string, patch: Partial<Omit<AgentActivityItem, 'id'>>): AgentActivityItem | undefined {
    const item = this.timeline.find((entry) => entry.id === id);
    if (!item) return undefined;
    Object.assign(item, patch);
    return item;
  }

  getTimeline(): AgentActivityItem[] {
    return this.timeline.map((item) => ({ ...item, arguments: { ...item.arguments } }));
  }

  clear(): void {
    this.timeline = [];
  }
}

export * from './types.js';
