import { describe, it, expect } from 'vitest';
import { ModelFabricRouter, ContextEngine } from '../src/index.js';
import { OpenAIProvider, OllamaProvider } from '@nayvid/model-providers';

describe('NAVI AI Core & Router', () => {
  it('enforces privacy policy in model routing', () => {
    const router = new ModelFabricRouter();
    const openai = new OpenAIProvider();
    const ollama = new OllamaProvider();
    router.registerProvider(openai);
    router.registerProvider(ollama);

    const cloudProvider = router.selectProvider('cloud-allowed');
    expect(cloudProvider.id).toBe('openai');

    const localProvider = router.selectProvider('local-only');
    expect(localProvider.id).toBe('ollama');

    expect(() => router.selectProvider('ai-disabled')).toThrow('disabled');
  });

  it('builds structured prompt context from design graph and files', () => {
    const engine = new ContextEngine();
    const promptCtx = engine.buildPromptContext({
      activeFile: { path: 'rtl/counter.sv', content: 'module counter; endmodule' },
      recentLogs: ['Simulation passed.'],
    });

    expect(promptCtx).toContain('rtl/counter.sv');
    expect(promptCtx).toContain('Simulation passed.');
  });
});
