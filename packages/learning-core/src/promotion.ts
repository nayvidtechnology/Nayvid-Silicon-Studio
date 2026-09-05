import type { PlaybookEntry } from './types.js';

export class StrategyPromotionPipeline {
  evaluateForPromotion(entry: PlaybookEntry): { promoted: boolean; newStatus: PlaybookEntry['status']; reason: string } {
    if (entry.status === 'CANDIDATE') {
      if (entry.runsEvaluated >= 10 && entry.regressionsCount <= 1) {
        entry.status = 'QUALIFIED';
        return {
          promoted: true,
          newStatus: 'QUALIFIED',
          reason: `Promoted to QUALIFIED after ${entry.runsEvaluated} runs with ${entry.regressionsCount} regression.`,
        };
      }
      return { promoted: false, newStatus: 'CANDIDATE', reason: 'Insufficient benchmark runs for qualification.' };
    }

    if (entry.status === 'QUALIFIED') {
      if (entry.runsEvaluated >= 50 && entry.regressionsCount <= 2 && entry.historicalImprovement.medianWnsGainPs > 20) {
        entry.status = 'PRODUCTION';
        return {
          promoted: true,
          newStatus: 'PRODUCTION',
          reason: `Promoted to PRODUCTION following statistical confidence evaluation on ${entry.runsEvaluated} blocks.`,
        };
      }
      return { promoted: false, newStatus: 'QUALIFIED', reason: 'Awaiting further statistical confidence benchmark runs.' };
    }

    return { promoted: false, newStatus: entry.status, reason: 'Already in PRODUCTION status.' };
  }
}
