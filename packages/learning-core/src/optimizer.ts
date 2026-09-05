import type { ParameterSpace, OptimizationResult } from './types.js';

export class BayesianOptimizer {
  optimize(
    spaces: ParameterSpace[],
    objectiveFn: (params: Record<string, number>) => number,
    maxIterations: number = 10
  ): OptimizationResult {
    let bestParams: Record<string, number> = {};
    let bestValue = -Infinity;

    for (let i = 0; i < maxIterations; i++) {
      const candidate: Record<string, number> = {};
      for (const space of spaces) {
        const val = space.min + Math.random() * (space.max - space.min);
        candidate[space.name] = space.step ? Math.round(val / space.step) * space.step : val;
      }

      const score = objectiveFn(candidate);
      if (score > bestValue) {
        bestValue = score;
        bestParams = candidate;
      }
    }

    return {
      bestParameters: bestParams,
      bestObjectiveValue: bestValue,
      iterationsCompleted: maxIterations,
    };
  }
}
