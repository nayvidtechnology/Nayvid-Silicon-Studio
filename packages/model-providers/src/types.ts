export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
}

export interface ToolCallSpec {
  name: string;
  arguments: Record<string, any>;
}

export interface ModelResponse {
  message: ModelMessage;
  toolCalls?: ToolCallSpec[];
  tokensUsed?: { prompt: number; completion: number };
}

export interface ModelProvider {
  id: string;
  name: string;
  isLocal: boolean;
  supportsVision: boolean;
  listModels(): Promise<string[]>;
  chat(messages: ModelMessage[], modelName?: string, tools?: any[]): Promise<ModelResponse>;
}
