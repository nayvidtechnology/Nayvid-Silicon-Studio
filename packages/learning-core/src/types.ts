export type StrategyStatus = 'CANDIDATE' | 'QUALIFIED' | 'PRODUCTION';

export interface PlaybookEntry {
  id: string;
  designFamily: string;
  nodeFamily: string;
  problem: string;
  context: {
    logicDepthGreaterThan?: number;
    congestionLessThanPct?: number;
    clockFrequencyGhzGreaterThan?: number;
  };
  successfulStrategy: string;
  historicalImprovement: {
    medianWnsGainPs: number;
    medianPowerDeltaPct: number;
    medianAreaDeltaPct: number;
  };
  runsEvaluated: number;
  regressionsCount: number;
  status: StrategyStatus;
  createdAt: string;
}

export interface ParameterSpace {
  name: string;
  min: number;
  max: number;
  step?: number;
}

export interface OptimizationResult {
  bestParameters: Record<string, number>;
  bestObjectiveValue: number;
  iterationsCompleted: number;
}
