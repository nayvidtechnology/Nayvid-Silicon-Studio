import type { PlaybookEntry, StrategyStatus } from './types.js';

export class EngineeringPlaybook {
  private entries: Map<string, PlaybookEntry> = new Map();

  addEntry(entry: PlaybookEntry): void {
    this.entries.set(entry.id, entry);
  }

  getEntry(id: string): PlaybookEntry | undefined {
    return this.entries.get(id);
  }

  findMatchingStrategy(
    designFamily: string,
    problem: string,
    logicDepth: number,
    congestionPct: number
  ): PlaybookEntry | undefined {
    for (const e of this.entries.values()) {
      if (
        e.status === 'PRODUCTION' &&
        e.designFamily.toLowerCase().includes(designFamily.toLowerCase()) &&
        e.problem.toLowerCase().includes(problem.toLowerCase())
      ) {
        if (
          (e.context.logicDepthGreaterThan === undefined || logicDepth > e.context.logicDepthGreaterThan) &&
          (e.context.congestionLessThanPct === undefined || congestionPct < e.context.congestionLessThanPct)
        ) {
          return e;
        }
      }
    }
    return undefined;
  }

  listEntries(status?: StrategyStatus): PlaybookEntry[] {
    const all = Array.from(this.entries.values());
    if (status) return all.filter((e) => e.status === status);
    return all;
  }
}
