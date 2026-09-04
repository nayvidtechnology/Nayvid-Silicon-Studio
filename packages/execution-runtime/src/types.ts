export type RuntimeType = 'native-windows' | 'wsl2' | 'linux' | 'docker' | 'auto';

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface ExecutionBackend {
  readonly type: RuntimeType;
  isAvailable(): Promise<boolean>;
  toHostPath(guestPath: string): string;
  toGuestPath(hostPath: string): string;
  execute(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
}
