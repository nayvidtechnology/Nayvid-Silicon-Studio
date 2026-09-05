export interface EdaExecutionResult {
  success: boolean;
  toolUsed: string;
  commandExecuted?: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  artifactsGenerated: string[];
  metrics?: {
    wnsNs?: number;
    tnsNs?: number;
    areaUm2?: number;
    powerMw?: number;
    drcCount?: number;
    lvsPass?: boolean;
    coveragePct?: number;
  };
}

export interface SynthesisIntent {
  topModule: string;
  files: string[];
  targetTech?: string;
  outputNetlistPath?: string;
  clockPeriodNs?: number;
}

export interface StaIntent {
  topModule: string;
  netlistPath: string;
  sdcPath: string;
  libertyFiles?: string[];
  corner?: string;
}

export interface PlaceAndRouteIntent {
  topModule: string;
  netlistPath: string;
  sdcPath: string;
  lefFiles?: string[];
  defPath?: string;
  outputGdsPath?: string;
}

export interface DrcIntent {
  gdsPath: string;
  ruleDeckPath?: string;
  topModule: string;
}

export interface EcoIntent {
  netlistPath: string;
  ecoScriptPath?: string;
  ecoModifications?: Array<{
    type: 'insert_buffer' | 'size_cell' | 'restructure' | 'pipeline';
    targetPinOrNet: string;
    parameter?: string;
  }>;
}
