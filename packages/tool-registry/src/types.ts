import type { RuntimeType } from '@nayvid/execution-runtime';

export type ToolCategory =
  | 'system'
  | 'language'
  | 'simulation'
  | 'synthesis'
  | 'formal'
  | 'physical'
  | 'timing'
  | 'signoff'
  | 'ai';

export type ToolCapability =
  | 'systemverilog'
  | 'vhdl'
  | 'simulation'
  | 'coverage'
  | 'formal'
  | 'lint'
  | 'cdc'
  | 'rdc'
  | 'synthesis'
  | 'sta'
  | 'power'
  | 'place-route'
  | 'drc'
  | 'lvs'
  | 'waveform';

export interface ToolDefinition {
  id: string;
  name: string;
  category: ToolCategory;
  binaryName: string;
  versionFlag?: string;
  probeArgs?: string[];
  supportedRuntimes: Record<RuntimeType, 'supported' | 'preferred' | 'limited' | 'unsupported'>;
  installGuide?: string;
  vendor?: string;
  commercial?: boolean;
  capabilities?: ToolCapability[];
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
