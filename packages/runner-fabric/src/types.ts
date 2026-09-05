export type RunnerEnvironmentType =
  | 'local'
  | 'wsl'
  | 'ssh'
  | 'slurm'
  | 'lsf'
  | 'kubernetes';

export interface ComputeResourceRequirements {
  cpus?: number;
  memoryMb?: number;
  gpus?: number;
  licensesRequired?: string[];
  walltimeMinutes?: number;
}

export interface LicenseStatus {
  feature: string;
  total: number;
  inUse: number;
  available: number;
}

export interface ExecutionJobSpec {
  id: string;
  command: string;
  args: string[];
  cwd?: string;
  requirements?: ComputeResourceRequirements;
  preferredEnvironment?: RunnerEnvironmentType;
}

export interface JobExecutionResult {
  jobId: string;
  environmentUsed: RunnerEnvironmentType;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}
