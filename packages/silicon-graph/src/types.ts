import type { DesignGraph } from '@nayvid/design-ir';

export type SiliconNodeKind =
  | 'Requirement'
  | 'ArchitectureBlock'
  | 'Module'
  | 'Instance'
  | 'Port'
  | 'Register'
  | 'Net'
  | 'FSM'
  | 'Clock'
  | 'Reset'
  | 'PowerDomain'
  | 'Cell'
  | 'Macro'
  | 'Pin'
  | 'PlacementRegion'
  | 'RouteSegment'
  | 'MetalLayer'
  | 'Via'
  | 'TimingPath'
  | 'TimingArc'
  | 'Corner'
  | 'Constraint'
  | 'Slack'
  | 'DRCViolation'
  | 'LVSViolation'
  | 'CDCViolation'
  | 'IRViolation'
  | 'EMViolation'
  | 'Test'
  | 'Assertion'
  | 'CoveragePoint'
  | 'FormalProperty'
  | 'Run'
  | 'Tool'
  | 'ToolVersion'
  | 'PDK'
  | 'RuleDeck'
  | 'Artifact'
  | 'ECO'
  | 'GitCommit';

export type SiliconRelationKind =
  | 'implements'
  | 'contains'
  | 'drives'
  | 'maps_to'
  | 'located_at'
  | 'participates_in'
  | 'violates'
  | 'fixed_by'
  | 'verified_by'
  | 'generated_by'
  | 'constrained_by'
  | 'depends_on';

export interface SiliconNode {
  id: string;
  kind: SiliconNodeKind;
  name: string;
  attributes: Record<string, any>;
  tags?: string[];
}

export interface SiliconEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relation: SiliconRelationKind;
  attributes?: Record<string, any>;
}

export interface TimingPathFilter {
  slackLessThan?: number;
  group?: string;
  startpoint?: string;
  endpoint?: string;
  corner?: string;
  limit?: number;
}

export interface DRCFilter {
  rule?: string;
  layer?: string;
  severity?: 'error' | 'warning' | 'info';
  limit?: number;
}

export interface SiliconGraphDump {
  nodes: SiliconNode[];
  edges: SiliconEdge[];
  projectDigest?: string;
}
