export type RuntimeKind = 'native-windows' | 'wsl2' | 'linux' | 'docker';
export type RunKind = 'lint' | 'compile' | 'simulation' | 'formal' | 'synthesis' | 'sta' | 'pnr' | 'signoff';
export type RunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'cancelled';
export type ProjectRole = 'viewer' | 'engineer' | 'lead' | 'admin';
export type ProjectAction = 'project:read' | 'project:write' | 'run:execute' | 'run:read' | 'signoff:approve' | 'ai:cloud' | 'license:manage';

export interface ToolchainRequirement { toolId: string; version?: string; required?: boolean; runtimes?: RuntimeKind[]; }
export interface ProjectVerificationConfig {
  testbenchTop: string;
  sources: string[];
  output?: string;
  waveformPath: string;
}
export interface ProjectManifest {
  schemaVersion: 1;
  name: string;
  topModule: string;
  sources: string[];
  includeDirs?: string[];
  constraints?: string[];
  verification?: ProjectVerificationConfig;
  defines?: Record<string, string | number | boolean>;
  parameters?: Record<string, string | number | boolean>;
  toolchain?: ToolchainRequirement[];
  signoff?: SignoffPolicy;
  security?: { allowedRuntimes?: RuntimeKind[]; cloudAi?: 'disabled' | 'approval-required' | 'allowed'; requireLockedToolchain?: boolean; };
}

export interface ToolchainProbe { toolId: string; installed: boolean; version?: string; runtime?: RuntimeKind; executable?: string; }
export interface ToolchainCheck { valid: boolean; errors: string[]; normalized: ToolchainProbe[]; digest: string; }

export interface ArtifactRef { digest: string; size: number; mediaType: string; logicalName: string; createdAt: string; path: string; }
export interface RunRecord {
  id: string; kind: RunKind; status: RunStatus; startedAt: string; completedAt?: string;
  projectDigest: string; toolchainDigest: string; command: string; args: string[]; cwd: string;
  runtime?: RuntimeKind; exitCode?: number; stdoutDigest?: string; stderrDigest?: string; artifacts: ArtifactRef[];
  metadata?: Record<string, unknown>;
}

export interface AuditEvent { timestamp: string; actor: string; action: string; resource: string; outcome: 'success' | 'failure' | 'denied'; details?: Record<string, unknown>; prevHash: string; hash: string; }

export interface SignoffPolicy {
  requireCompile?: boolean; requireSimulation?: boolean; requireFormal?: boolean; requireSynthesis?: boolean;
  minCoveragePercent?: number; maxCdcIssues?: number; maxUnconstrainedPaths?: number; minWnsNs?: number;
  requireTraceabilityPercent?: number; requireToolchainLock?: boolean;
}
export interface SignoffEvidence {
  compilePassed?: boolean; simulationPassed?: boolean; formalPassed?: boolean; synthesisPassed?: boolean;
  coveragePercent?: number; cdcIssues?: number; unconstrainedPaths?: number; wnsNs?: number;
  traceabilityPercent?: number; toolchainLocked?: boolean;
}
export interface SignoffDecision { passed: boolean; blockers: string[]; warnings: string[]; score: number; }

export interface LicensePayload { customer: string; edition: 'community' | 'professional' | 'enterprise'; expiresAt: string; features: string[]; seats?: number; licenseId: string; }
export interface SignedLicense { payload: LicensePayload; signatureBase64: string; }
export interface LicenseDecision { valid: boolean; reason?: string; payload?: LicensePayload; }

export interface ProductionReadinessReport { projectValid: boolean; toolchainValid: boolean; auditValid: boolean; signoff: SignoffDecision; blockers: string[]; }
