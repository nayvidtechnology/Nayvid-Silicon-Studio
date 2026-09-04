export type VerificationStatus = 'pass' | 'fail' | 'not-run';

export interface VerificationCaseResult {
  name: string;
  status: VerificationStatus;
  durationMs?: number;
}

export interface CoverageMetrics {
  line?: number;
  branch?: number;
  toggle?: number;
  fsm?: number;
  functional?: number;
}

export interface VerificationSnapshot {
  tests: VerificationCaseResult[];
  assertions: VerificationCaseResult[];
  coverage: CoverageMetrics;
}

export interface VerificationSummary {
  testsPassed: number;
  testsFailed: number;
  assertionsPassed: number;
  assertionsFailed: number;
  averageCoverage: number;
  score: number;
  status: 'healthy' | 'warning' | 'failing';
}

export interface DesignHealthInput {
  compile: VerificationStatus;
  lint: VerificationStatus;
  simulation: VerificationStatus;
  assertions: VerificationStatus;
  coveragePercent?: number;
  cdcIssues?: number;
  unconstrainedPaths?: number;
  combinationalLoops?: number;
  timingWnsNs?: number;
}

export interface DesignHealthCheck {
  id: string;
  label: string;
  status: 'pass' | 'warning' | 'fail' | 'unknown';
  detail: string;
  weight: number;
}

export interface DesignHealthReport {
  score: number;
  checks: DesignHealthCheck[];
  blockers: string[];
}

export interface RequirementTrace {
  id: string;
  text: string;
  implementation: string[];
  tests: string[];
  assertions: string[];
}

export interface RequirementTraceResult extends RequirementTrace {
  status: 'verified' | 'partially-verified' | 'unverified';
  gaps: string[];
}

export type RegisterAccess = 'RO' | 'RW' | 'WO' | 'W1C' | 'W1S';

export interface RegisterField {
  name: string;
  lsb: number;
  width: number;
  access: RegisterAccess;
  reset?: number;
  description?: string;
}

export interface RegisterDefinition {
  name: string;
  offset: number;
  width?: number;
  description?: string;
  fields: RegisterField[];
}

export interface RegisterMap {
  name: string;
  baseAddress?: number;
  registers: RegisterDefinition[];
}

export interface RegisterMapValidation {
  valid: boolean;
  errors: string[];
}

export interface PpaMetrics {
  area?: number;
  powerMw?: number;
  fmaxMhz?: number;
  wnsNs?: number;
}

export interface PpaCandidate {
  name: string;
  metrics: PpaMetrics;
}

export interface PpaWeights {
  area: number;
  power: number;
  performance: number;
  timing: number;
}

export interface PpaComparisonRow extends PpaCandidate {
  score: number;
  deltas: PpaMetrics;
}

export interface FormalProperty {
  name: string;
  description: string;
  sva: string;
}
