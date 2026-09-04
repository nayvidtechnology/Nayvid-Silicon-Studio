import { describe, it, expect } from 'vitest';
import { OpenAIProvider, OllamaProvider } from '../src/index.js';

describe('Model Providers', () => {
  it('lists models and sends chat messages', async () => {
    const openai = new OpenAIProvider();
    expect(await openai.listModels()).toContain('gpt-4o');

    const res = await openai.chat([{ role: 'user', content: 'Explain counter.sv' }]);
    expect(res.message.content).toContain('[OpenAI');

    const ollama = new OllamaProvider();
    expect(ollama.isLocal).toBe(true);
    const ollamaRes = await ollama.chat([{ role: 'user', content: 'Local test' }]);
    expect(ollamaRes.message.content).toContain('[Ollama');
  });
});
