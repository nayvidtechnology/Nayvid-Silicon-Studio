import { describe, expect, it } from 'vitest';
import { AgentTimelineTracker, ContextEngine, ModelFabricRouter } from '../src/index.js';
import { OpenAIProvider, OllamaProvider } from '@nayvid/model-providers';

describe('NAVI AI Core & Router', () => {
  it('enforces privacy policy and explicit cloud approval in model routing', () => {
    const router = new ModelFabricRouter();
    router.registerProvider(new OpenAIProvider({ apiKey: 'test' }));
    router.registerProvider(new OllamaProvider());

    expect(router.selectProvider('cloud-allowed').id).toBe('openai');
    expect(router.selectProvider('local-only').id).toBe('ollama');
    expect(router.selectProvider('ask-before-cloud').id).toBe('ollama');
    expect(router.selectProvider('ask-before-cloud', false, true, 'openai').id).toBe('openai');
    expect(() => router.selectProvider('ai-disabled')).toThrow('disabled');
  });

  it('refuses cloud access under ask-before-cloud if no local provider exists', () => {
    const router = new ModelFabricRouter();
    router.registerProvider(new OpenAIProvider({ apiKey: 'test' }));
    expect(() => router.selectProvider('ask-before-cloud')).toThrow(/explicit approval/);
  });

  it('builds structured prompt context from design graph, selected signal and logs', () => {
    const engine = new ContextEngine();
    const promptCtx = engine.buildPromptContext({
      activeFile: { path: 'rtl/counter.sv', content: 'module counter; endmodule' },
      selectedSignal: 'count',
      recentLogs: ['Simulation passed.'],
    });

    expect(promptCtx).toContain('rtl/counter.sv');
    expect(promptCtx).toContain('Selected Signal');
    expect(promptCtx).toContain('count');
    expect(promptCtx).toContain('Simulation passed.');
  });

  it('returns defensive timeline copies and supports status updates', () => {
    const tracker = new AgentTimelineTracker();
    const item = tracker.addActivity({
      skill: 'rtl-engineer',
      toolName: 'run_lint',
      arguments: { files: ['rtl/top.sv'] },
      status: 'started',
    });
    tracker.updateActivity(item.id, { status: 'completed', output: 'clean' });

    const timeline = tracker.getTimeline();
    expect(timeline[0].status).toBe('completed');
    timeline[0].arguments.files = [];
    expect((tracker.getTimeline()[0].arguments.files as string[]).length).toBe(1);
  });
});
