export interface SourceLocation {
  file: string;
  line: number;
  column?: number;
}

export type PortDirection = 'input' | 'output' | 'inout';

export interface DesignPort {
  name: string;
  direction: PortDirection;
  width: number;
  type?: string;
  location?: SourceLocation;
}

export interface DesignDriverExpression {
  expression: string;
  dependencies: string[];
  sequential: boolean;
  location: SourceLocation;
}

export interface DesignSignal {
  name: string;
  width: number;
  isRegister: boolean;
  clockDomain?: string;
  resetDomain?: string;
  drivers: SourceLocation[];
  loads: SourceLocation[];
  /** Structured driver information used by VeriVisual/NAVI signal tracing. */
  driverExpressions?: DesignDriverExpression[];
  /** Direct data/control dependencies discovered while parsing RTL. */
  dependsOn?: string[];
  location?: SourceLocation;
}

export interface DesignInstance {
  name: string;
  moduleName: string;
  portConnections: Record<string, string>;
  location?: SourceLocation;
}

export interface FSMState {
  name: string;
  value?: string | number;
}

export interface FSMTransition {
  from: string;
  to: string;
  condition?: string;
  location?: SourceLocation;
}

export interface DesignFSM {
  name: string;
  stateRegister: string;
  states: FSMState[];
  transitions: FSMTransition[];
  location?: SourceLocation;
}

export interface DesignModule {
  name: string;
  file: string;
  ports: DesignPort[];
  signals: DesignSignal[];
  instances: DesignInstance[];
  fsms: DesignFSM[];
  clockDomains: string[];
  resetDomains: string[];
}

export interface DesignGraph {
  topModule: string;
  modules: Record<string, DesignModule>;
}
