import { describe, it, expect } from 'vitest';
import { EngineeringPlaybook, BayesianOptimizer, StrategyPromotionPipeline } from '../src/index.js';

describe('Learning Core Engine', () => {
  it('manages playbook strategies and promotes candidates', () => {
    const playbook = new EngineeringPlaybook();
    const pipeline = new StrategyPromotionPipeline();

    const entry = {
      id: 'strat_01',
      designFamily: 'RISC-V execution block',
      nodeFamily: 'advanced FinFET',
      problem: 'ALU setup',
      context: { logicDepthGreaterThan: 8, congestionLessThanPct: 60 },
      successfulStrategy: 'restructure adder tree before cell sizing',
      historicalImprovement: { medianWnsGainPs: 84, medianPowerDeltaPct: -0.5, medianAreaDeltaPct: 0.2 },
      runsEvaluated: 12,
      regressionsCount: 0,
      status: 'CANDIDATE' as const,
      createdAt: new Date().toISOString(),
    };

    playbook.addEntry(entry);

    const eval1 = pipeline.evaluateForPromotion(entry);
    expect(eval1.promoted).toBe(true);
    expect(eval1.newStatus).toBe('QUALIFIED');

    entry.runsEvaluated = 55;
    entry.regressionsCount = 1;
    const eval2 = pipeline.evaluateForPromotion(entry);
    expect(eval2.promoted).toBe(true);
    expect(eval2.newStatus).toBe('PRODUCTION');

    const match = playbook.findMatchingStrategy('RISC-V', 'ALU setup', 10, 45);
    expect(match).toBeDefined();
    expect(match?.successfulStrategy).toContain('adder tree');
  });

  it('optimizes parameters using BayesianOptimizer', () => {
    const optimizer = new BayesianOptimizer();
    const result = optimizer.optimize(
      [
        { name: 'placementEffort', min: 1, max: 5, step: 1 },
        { name: 'clockUncertaintyPs', min: 10, max: 100, step: 5 },
      ],
      (params) => params.placementEffort * 10 - params.clockUncertaintyPs,
      20
    );

    expect(result.iterationsCompleted).toBe(20);
    expect(result.bestParameters.placementEffort).toBeDefined();
  });
});
