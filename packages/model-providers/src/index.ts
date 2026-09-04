import type { ModelProvider, ModelMessage, ModelResponse, ToolCallSpec } from './types.js';

type FetchLike = typeof fetch;

export interface ProviderOptions {
  apiKey?: string;
  endpoint?: string;
  defaultModel?: string;
  fetchImpl?: FetchLike;
}

export class ModelProviderError extends Error {
  constructor(
    message: string,
    readonly providerId: string,
    readonly status?: number,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ModelProviderError';
  }
}

async function jsonRequest(
  providerId: string,
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit
): Promise<any> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (err) {
    throw new ModelProviderError(`Unable to reach ${providerId} provider.`, providerId, undefined, err);
  }
  const text = await response.text();
  let data: any = {};
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  if (!response.ok) {
    const message = data?.error?.message || data?.message || data?.error || `${providerId} request failed with HTTP ${response.status}`;
    throw new ModelProviderError(String(message), providerId, response.status, data);
  }
  return data;
}

function requireKey(providerId: string, apiKey?: string): string {
  if (!apiKey) throw new ModelProviderError(`No API key configured for ${providerId}.`, providerId);
  return apiKey;
}

function openAIOutputText(data: any): string {
  if (typeof data?.output_text === 'string') return data.output_text;
  const pieces: string[] = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') pieces.push(content.text);
    }
  }
  return pieces.join('\n');
}

export class OpenAIProvider implements ModelProvider {
  id = 'openai';
  name = 'OpenAI';
  isLocal = false;
  supportsVision = true;
  private apiKey?: string;
  private endpoint: string;
  private defaultModel: string;
  private fetchImpl: FetchLike;

  constructor(options: string | ProviderOptions = {}) {
    const opts = typeof options === 'string' ? { apiKey: options } : options;
    this.apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
    this.endpoint = (opts.endpoint ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.defaultModel = opts.defaultModel ?? process.env.NAYVID_OPENAI_MODEL ?? 'gpt-5-mini';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async listModels(): Promise<string[]> {
    const key = requireKey(this.id, this.apiKey);
    const data = await jsonRequest(this.id, this.fetchImpl, `${this.endpoint}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    return (data.data || []).map((m: any) => m.id).filter(Boolean).sort();
  }

  async chat(messages: ModelMessage[], modelName: string = this.defaultModel, tools?: any[]): Promise<ModelResponse> {
    const key = requireKey(this.id, this.apiKey);
    const body: any = { model: modelName, input: messages.map((m) => ({ role: m.role === 'tool' ? 'user' : m.role, content: m.content })) };
    if (tools?.length) body.tools = tools;
    const data = await jsonRequest(this.id, this.fetchImpl, `${this.endpoint}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const toolCalls: ToolCallSpec[] = (data.output || [])
      .filter((item: any) => item.type === 'function_call')
      .map((item: any) => ({ name: item.name, arguments: typeof item.arguments === 'string' ? JSON.parse(item.arguments || '{}') : (item.arguments || {}) }));
    return {
      message: { role: 'assistant', content: openAIOutputText(data) },
      toolCalls: toolCalls.length ? toolCalls : undefined,
      tokensUsed: data.usage ? { prompt: data.usage.input_tokens ?? 0, completion: data.usage.output_tokens ?? 0 } : undefined,
    };
  }
}

export class AnthropicProvider implements ModelProvider {
  id = 'anthropic';
  name = 'Anthropic';
  isLocal = false;
  supportsVision = true;
  private apiKey?: string;
  private endpoint: string;
  private defaultModel: string;
  private fetchImpl: FetchLike;

  constructor(options: string | ProviderOptions = {}) {
    const opts = typeof options === 'string' ? { apiKey: options } : options;
    this.apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.endpoint = (opts.endpoint ?? 'https://api.anthropic.com/v1').replace(/\/$/, '');
    this.defaultModel = opts.defaultModel ?? process.env.NAYVID_ANTHROPIC_MODEL ?? 'claude-sonnet-4-5';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    return {
      'x-api-key': requireKey(this.id, this.apiKey),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    };
  }

  async listModels(): Promise<string[]> {
    const data = await jsonRequest(this.id, this.fetchImpl, `${this.endpoint}/models`, { headers: this.headers() });
    return (data.data || []).map((m: any) => m.id).filter(Boolean);
  }

  async chat(messages: ModelMessage[], modelName: string = this.defaultModel, tools?: any[]): Promise<ModelResponse> {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const conversation = messages.filter((m) => m.role !== 'system' && m.role !== 'tool').map((m) => ({ role: m.role, content: m.content }));
    const body: any = { model: modelName, max_tokens: 4096, messages: conversation };
    if (system) body.system = system;
    if (tools?.length) body.tools = tools;
    const data = await jsonRequest(this.id, this.fetchImpl, `${this.endpoint}/messages`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify(body),
    });
    const text = (data.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
    const toolCalls: ToolCallSpec[] = (data.content || []).filter((c: any) => c.type === 'tool_use').map((c: any) => ({ name: c.name, arguments: c.input || {} }));
    return {
      message: { role: 'assistant', content: text },
      toolCalls: toolCalls.length ? toolCalls : undefined,
      tokensUsed: data.usage ? { prompt: data.usage.input_tokens ?? 0, completion: data.usage.output_tokens ?? 0 } : undefined,
    };
  }
}

export class OllamaProvider implements ModelProvider {
  id = 'ollama';
  name = 'Ollama Local';
  isLocal = true;
  supportsVision = true;
  private endpoint: string;
  private defaultModel: string;
  private fetchImpl: FetchLike;

  constructor(options: string | ProviderOptions = {}) {
    const opts = typeof options === 'string' ? { endpoint: options } : options;
    this.endpoint = (opts.endpoint ?? 'http://localhost:11434').replace(/\/$/, '');
    this.defaultModel = opts.defaultModel ?? process.env.NAYVID_OLLAMA_MODEL ?? 'qwen2.5-coder:7b';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async listModels(): Promise<string[]> {
    const data = await jsonRequest(this.id, this.fetchImpl, `${this.endpoint}/api/tags`, {});
    return (data.models || []).map((m: any) => m.name || m.model).filter(Boolean);
  }

  async chat(messages: ModelMessage[], modelName: string = this.defaultModel, tools?: any[]): Promise<ModelResponse> {
    const body: any = { model: modelName, stream: false, messages: messages.map((m) => ({ role: m.role, content: m.content })) };
    if (tools?.length) body.tools = tools;
    const data = await jsonRequest(this.id, this.fetchImpl, `${this.endpoint}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const toolCalls: ToolCallSpec[] = (data.message?.tool_calls || []).map((c: any) => ({ name: c.function?.name, arguments: c.function?.arguments || {} })).filter((c: any) => c.name);
    return {
      message: { role: 'assistant', content: data.message?.content || '' },
      toolCalls: toolCalls.length ? toolCalls : undefined,
      tokensUsed: { prompt: data.prompt_eval_count ?? 0, completion: data.eval_count ?? 0 },
    };
  }
}

export class GeminiProvider implements ModelProvider {
  id = 'gemini';
  name = 'Google Gemini';
  isLocal = false;
  supportsVision = true;
  private apiKey?: string;
  private endpoint: string;
  private defaultModel: string;
  private fetchImpl: FetchLike;

  constructor(options: string | ProviderOptions = {}) {
    const opts = typeof options === 'string' ? { apiKey: options } : options;
    this.apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
    this.endpoint = (opts.endpoint ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    this.defaultModel = opts.defaultModel ?? process.env.NAYVID_GEMINI_MODEL ?? 'gemini-3.6-flash';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    return { 'x-goog-api-key': requireKey(this.id, this.apiKey), 'Content-Type': 'application/json' };
  }

  async listModels(): Promise<string[]> {
    const data = await jsonRequest(this.id, this.fetchImpl, `${this.endpoint}/models`, { headers: this.headers() });
    return (data.models || []).map((m: any) => String(m.name || '').replace(/^models\//, '')).filter(Boolean);
  }

  async chat(messages: ModelMessage[], modelName: string = this.defaultModel): Promise<ModelResponse> {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const contents = messages.filter((m) => m.role !== 'system' && m.role !== 'tool').map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const body: any = { contents };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const data = await jsonRequest(this.id, this.fetchImpl, `${this.endpoint}/models/${encodeURIComponent(modelName)}:generateContent`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify(body),
    });
    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p: any) => p.text).filter(Boolean).join('\n');
    const usage = data.usageMetadata;
    return {
      message: { role: 'assistant', content: text },
      tokensUsed: usage ? { prompt: usage.promptTokenCount ?? 0, completion: usage.candidatesTokenCount ?? 0 } : undefined,
    };
  }
}

export * from './types.js';
