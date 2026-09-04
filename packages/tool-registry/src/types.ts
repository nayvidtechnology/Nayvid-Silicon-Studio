import type { RuntimeType } from '@nayvid/execution-runtime';

export type ToolCategory =
  | 'system'
  | 'language'
  | 'simulation'
  | 'synthesis'
  | 'formal'
  | 'physical'
  | 'ai';

export interface ToolDefinition {
  id: string;
  name: string;
  category: ToolCategory;
  binaryName: string;
  versionFlag?: string;
  supportedRuntimes: Record<RuntimeType, 'supported' | 'preferred' | 'limited' | 'unsupported'>;
  installGuide?: string;
}

export interface ToolCheckResult {
  tool: ToolDefinition;
  installed: boolean;
  version?: string;
  runtimeUsed: RuntimeType;
  message?: string;
}

export interface DoctorReport {
  timestamp: string;
  platform: string;
  checks: ToolCheckResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
}
