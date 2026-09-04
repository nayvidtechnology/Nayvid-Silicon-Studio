import { describe, expect, it, vi } from 'vitest';
import { AnthropicProvider, GeminiProvider, ModelProviderError, OllamaProvider, OpenAIProvider } from '../src/index.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('Model Providers', () => {
  it('calls OpenAI Responses API and extracts text, usage and tool calls', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain('/responses');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe('test-model');
      return jsonResponse({
        output: [
          { type: 'message', content: [{ type: 'output_text', text: 'RTL looks good' }] },
          { type: 'function_call', name: 'run_lint', arguments: '{"files":["rtl/top.sv"]}' },
        ],
        usage: { input_tokens: 11, output_tokens: 7 },
      });
    }) as any;

    const provider = new OpenAIProvider({ apiKey: 'test-key', defaultModel: 'test-model', fetchImpl });
    const res = await provider.chat([{ role: 'user', content: 'Review RTL' }]);
    expect(res.message.content).toBe('RTL looks good');
    expect(res.tokensUsed).toEqual({ prompt: 11, completion: 7 });
    expect(res.toolCalls?.[0]).toEqual({ name: 'run_lint', arguments: { files: ['rtl/top.sv'] } });
  });

  it('calls Anthropic Messages API with separated system prompt', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('anthropic-key');
      const body = JSON.parse(String(init?.body));
      expect(body.system).toContain('verification engineer');
      return jsonResponse({
        content: [
          { type: 'text', text: 'Assertion generated' },
          { type: 'tool_use', name: 'run_simulation', input: { topModule: 'tb' } },
        ],
        usage: { input_tokens: 20, output_tokens: 8 },
      });
    }) as any;

    const provider = new AnthropicProvider({ apiKey: 'anthropic-key', fetchImpl });
    const res = await provider.chat([
      { role: 'system', content: 'You are a verification engineer' },
      { role: 'user', content: 'Create assertion' },
    ]);
    expect(res.message.content).toBe('Assertion generated');
    expect(res.toolCalls?.[0].name).toBe('run_simulation');
  });

  it('calls Ollama locally and discovers local models', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/api/tags')) return jsonResponse({ models: [{ name: 'qwen-coder' }] });
      expect(String(url)).toContain('/api/chat');
      expect(JSON.parse(String(init?.body)).stream).toBe(false);
      return jsonResponse({ message: { role: 'assistant', content: 'Local answer' }, prompt_eval_count: 4, eval_count: 3 });
    }) as any;

    const provider = new OllamaProvider({ endpoint: 'http://ollama.test', fetchImpl });
    expect(provider.isLocal).toBe(true);
    expect(await provider.listModels()).toEqual(['qwen-coder']);
    const res = await provider.chat([{ role: 'user', content: 'Private RTL' }], 'qwen-coder');
    expect(res.message.content).toBe('Local answer');
  });

  it('calls Gemini generateContent and maps conversation roles', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain(':generateContent');
      const headers = init?.headers as Record<string, string>;
      expect(headers['x-goog-api-key']).toBe('gemini-key');
      const body = JSON.parse(String(init?.body));
      expect(body.systemInstruction.parts[0].text).toContain('RTL expert');
      expect(body.contents[0].role).toBe('user');
      return jsonResponse({
        candidates: [{ content: { parts: [{ text: 'Gemini analysis' }] } }],
        usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 6 },
      });
    }) as any;

    const provider = new GeminiProvider({ apiKey: 'gemini-key', defaultModel: 'gemini-test', fetchImpl });
    const res = await provider.chat([
      { role: 'system', content: 'You are an RTL expert' },
      { role: 'user', content: 'Analyze this module' },
    ]);
    expect(res.message.content).toBe('Gemini analysis');
    expect(res.tokensUsed).toEqual({ prompt: 9, completion: 6 });
  });

  it('does not silently use mock credentials', async () => {
    const provider = new OpenAIProvider({ apiKey: '', fetchImpl: vi.fn() as any });
    await expect(provider.chat([{ role: 'user', content: 'hello' }])).rejects.toBeInstanceOf(ModelProviderError);
  });

  it('surfaces provider HTTP errors with status and provider identity', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: 'rate limited' } }, 429)) as any;
    const provider = new OpenAIProvider({ apiKey: 'test-key', fetchImpl });
    await expect(provider.chat([{ role: 'user', content: 'hello' }])).rejects.toMatchObject({
      providerId: 'openai',
      status: 429,
      message: 'rate limited',
    });
  });
});
