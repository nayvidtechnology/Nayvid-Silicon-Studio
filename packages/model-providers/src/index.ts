import type { ModelProvider, ModelMessage, ModelResponse } from './types.js';

export class OpenAIProvider implements ModelProvider {
  id = 'openai';
  name = 'OpenAI';
  isLocal = false;
  supportsVision = true;

  constructor(private apiKey: string = 'mock-key') {}

  async listModels(): Promise<string[]> {
    return ['gpt-4o', 'gpt-4o-mini', 'o3-mini'];
  }

  async chat(messages: ModelMessage[], modelName: string = 'gpt-4o-mini'): Promise<ModelResponse> {
    const lastMsg = messages[messages.length - 1]?.content || '';
    return {
      message: {
        role: 'assistant',
        content: `[OpenAI ${modelName}] Response to: ${lastMsg}`,
      },
      tokensUsed: { prompt: 50, completion: 25 },
    };
  }
}

export class AnthropicProvider implements ModelProvider {
  id = 'anthropic';
  name = 'Anthropic';
  isLocal = false;
  supportsVision = true;

  constructor(private apiKey: string = 'mock-key') {}

  async listModels(): Promise<string[]> {
    return ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'];
  }

  async chat(messages: ModelMessage[], modelName: string = 'claude-3-5-sonnet-latest'): Promise<ModelResponse> {
    const lastMsg = messages[messages.length - 1]?.content || '';
    return {
      message: {
        role: 'assistant',
        content: `[Anthropic ${modelName}] Response to: ${lastMsg}`,
      },
      tokensUsed: { prompt: 60, completion: 30 },
    };
  }
}

export class OllamaProvider implements ModelProvider {
  id = 'ollama';
  name = 'Ollama Local';
  isLocal = true;
  supportsVision = true;

  constructor(private endpoint: string = 'http://localhost:11434') {}

  async listModels(): Promise<string[]> {
    return ['llama3.2', 'deepseek-r1:8b', 'qwen2.5-coder:7b'];
  }

  async chat(messages: ModelMessage[], modelName: string = 'llama3.2'): Promise<ModelResponse> {
    const lastMsg = messages[messages.length - 1]?.content || '';
    return {
      message: {
        role: 'assistant',
        content: `[Ollama ${modelName}] Response to: ${lastMsg}`,
      },
      tokensUsed: { prompt: 40, completion: 20 },
    };
  }
}

export class GeminiProvider implements ModelProvider {
  id = 'gemini';
  name = 'Google Gemini';
  isLocal = false;
  supportsVision = true;

  constructor(private apiKey: string = 'mock-key') {}

  async listModels(): Promise<string[]> {
    return ['gemini-1.5-pro', 'gemini-1.5-flash'];
  }

  async chat(messages: ModelMessage[], modelName: string = 'gemini-1.5-flash'): Promise<ModelResponse> {
    const lastMsg = messages[messages.length - 1]?.content || '';
    return {
      message: {
        role: 'assistant',
        content: `[Gemini ${modelName}] Response to: ${lastMsg}`,
      },
      tokensUsed: { prompt: 45, completion: 22 },
    };
  }
}

export * from './types.js';
