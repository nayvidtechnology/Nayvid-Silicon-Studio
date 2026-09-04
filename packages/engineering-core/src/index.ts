import type { DesignGraph } from '@nayvid/design-ir';
import type {
  CoverageMetrics,
  DesignHealthCheck,
  DesignHealthInput,
  DesignHealthReport,
  FormalProperty,
  PpaCandidate,
  PpaComparisonRow,
  PpaMetrics,
  PpaWeights,
  RegisterDefinition,
  RegisterField,
  RegisterMap,
  RegisterMapValidation,
  RequirementTrace,
  RequirementTraceResult,
  VerificationSnapshot,
  VerificationSummary,
} from './types.js';

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function average(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export class VerificationCockpit {
  summarize(snapshot: VerificationSnapshot): VerificationSummary {
    const testsPassed = snapshot.tests.filter((t) => t.status === 'pass').length;
    const testsFailed = snapshot.tests.filter((t) => t.status === 'fail').length;
    const assertionsPassed = snapshot.assertions.filter((t) => t.status === 'pass').length;
    const assertionsFailed = snapshot.assertions.filter((t) => t.status === 'fail').length;
    const coverageValues = Object.values(snapshot.coverage).filter((v): v is number => typeof v === 'number').map(clampPercent);
    const averageCoverage = Math.round(average(coverageValues) * 100) / 100;

    const testTotal = snapshot.tests.length || 1;
    const assertionTotal = snapshot.assertions.length || 1;
    const testScore = testsPassed / testTotal * 100;
    const assertionScore = assertionsPassed / assertionTotal * 100;
    const score = Math.round((testScore * 0.45 + assertionScore * 0.30 + averageCoverage * 0.25) * 100) / 100;
    const status = testsFailed > 0 || assertionsFailed > 0 ? 'failing' : score >= 85 ? 'healthy' : 'warning';

    return { testsPassed, testsFailed, assertionsPassed, assertionsFailed, averageCoverage, score, status };
  }

  uncoveredAreas(coverage: CoverageMetrics, threshold = 90): string[] {
    return Object.entries(coverage)
      .filter(([, value]) => typeof value === 'number' && value < threshold)
      .sort((a, b) => Number(a[1]) - Number(b[1]))
      .map(([name, value]) => `${name}: ${value}%`);
  }
}

export class DesignHealthEngine {
  evaluate(input: DesignHealthInput): DesignHealthReport {
    const checks: DesignHealthCheck[] = [
      this.statusCheck('compile', 'Compile', input.compile, 18),
      this.statusCheck('lint', 'Lint', input.lint, 10),
      this.statusCheck('simulation', 'Simulation', input.simulation, 18),
      this.statusCheck('assertions', 'Assertions', input.assertions, 14),
      {
        id: 'coverage', label: 'Coverage', weight: 12,
        status: input.coveragePercent === undefined ? 'unknown' : input.coveragePercent >= 90 ? 'pass' : input.coveragePercent >= 70 ? 'warning' : 'fail',
        detail: input.coveragePercent === undefined ? 'Coverage not available' : `${input.coveragePercent}%`,
      },
      {
        id: 'cdc', label: 'CDC', weight: 8,
        status: input.cdcIssues === undefined ? 'unknown' : input.cdcIssues === 0 ? 'pass' : 'fail',
        detail: input.cdcIssues === undefined ? 'CDC not analyzed' : `${input.cdcIssues} issue(s)`,
      },
      {
        id: 'constraints', label: 'Timing constraints', weight: 7,
        status: input.unconstrainedPaths === undefined ? 'unknown' : input.unconstrainedPaths === 0 ? 'pass' : 'warning',
        detail: input.unconstrainedPaths === undefined ? 'Constraint analysis not available' : `${input.unconstrainedPaths} unconstrained path(s)`,
      },
      {
        id: 'loops', label: 'Combinational loops', weight: 6,
        status: input.combinationalLoops === undefined ? 'unknown' : input.combinationalLoops === 0 ? 'pass' : 'fail',
        detail: input.combinationalLoops === undefined ? 'Loop analysis not available' : `${input.combinationalLoops} loop(s)`,
      },
      {
        id: 'timing', label: 'Timing', weight: 7,
        status: input.timingWnsNs === undefined ? 'unknown' : input.timingWnsNs >= 0 ? 'pass' : input.timingWnsNs >= -0.25 ? 'warning' : 'fail',
        detail: input.timingWnsNs === undefined ? 'WNS not available' : `WNS ${input.timingWnsNs} ns`,
      },
    ];

    const earned = checks.reduce((sum, c) => {
      const factor = c.status === 'pass' ? 1 : c.status === 'warning' ? 0.5 : c.status === 'unknown' ? 0.25 : 0;
      return sum + c.weight * factor;
    }, 0);
    const total = checks.reduce((sum, c) => sum + c.weight, 0);
    const score = Math.round(earned / total * 100);
    const blockers = checks.filter((c) => c.status === 'fail' && ['compile', 'simulation', 'assertions', 'cdc', 'loops'].includes(c.id)).map((c) => c.label);
    return { score, checks, blockers };
  }

  fromDesignGraph(graph: DesignGraph): Pick<DesignHealthInput, 'cdcIssues' | 'combinationalLoops'> {
    let cdcIssues = 0;
    let combinationalLoops = 0;
    for (const mod of Object.values(graph.modules)) {
      for (const sig of mod.signals) {
        if (sig.dependsOn?.includes(sig.name)) combinationalLoops++;
        if (sig.clockDomain && !mod.clockDomains.includes(sig.clockDomain)) cdcIssues++;
      }
    }
    return { cdcIssues, combinationalLoops };
  }

  private statusCheck(id: string, label: string, status: DesignHealthInput['compile'], weight: number): DesignHealthCheck {
    return { id, label, weight, status: status === 'pass' ? 'pass' : status === 'fail' ? 'fail' : 'unknown', detail: status };
  }
}

export class TraceabilityMatrix {
  analyze(requirements: RequirementTrace[]): RequirementTraceResult[] {
    return requirements.map((req) => {
      const gaps: string[] = [];
      if (!req.implementation.length) gaps.push('No implementation link');
      if (!req.tests.length) gaps.push('No test link');
      if (!req.assertions.length) gaps.push('No assertion link');
      const verified = req.implementation.length > 0 && (req.tests.length > 0 || req.assertions.length > 0);
      const fullyVerified = req.implementation.length > 0 && req.tests.length > 0 && req.assertions.length > 0;
      return { ...req, gaps, status: fullyVerified ? 'verified' : verified ? 'partially-verified' : 'unverified' };
    });
  }

  coverage(requirements: RequirementTrace[]): number {
    if (!requirements.length) return 100;
    const results = this.analyze(requirements);
    return Math.round(results.filter((r) => r.status === 'verified').length / results.length * 10000) / 100;
  }
}

export class RegisterMapGenerator {
  validate(map: RegisterMap): RegisterMapValidation {
    const errors: string[] = [];
    const offsets = new Set<number>();
    for (const reg of map.registers) {
      if (offsets.has(reg.offset)) errors.push(`Duplicate register offset 0x${reg.offset.toString(16)} (${reg.name})`);
      offsets.add(reg.offset);
      if (reg.offset < 0 || reg.offset % 4 !== 0) errors.push(`Register ${reg.name} offset must be non-negative and 32-bit aligned`);
      const width = reg.width ?? 32;
      const occupied = new Set<number>();
      for (const field of reg.fields) {
        if (field.width <= 0) errors.push(`Field ${reg.name}.${field.name} width must be positive`);
        if (field.lsb < 0 || field.lsb + field.width > width) errors.push(`Field ${reg.name}.${field.name} exceeds ${width}-bit register width`);
        for (let bit = field.lsb; bit < field.lsb + field.width; bit++) {
          if (occupied.has(bit)) errors.push(`Field ${reg.name}.${field.name} overlaps bit ${bit}`);
          occupied.add(bit);
        }
        if (field.reset !== undefined && field.reset >= 2 ** Math.min(field.width, 31)) errors.push(`Field ${reg.name}.${field.name} reset value does not fit width`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  generateSystemVerilogPackage(map: RegisterMap): string {
    this.assertValid(map);
    const prefix = map.name.toUpperCase();
    const lines = [`package ${map.name}_regs_pkg;`];
    for (const reg of map.registers) {
      lines.push(`  localparam logic [31:0] ${prefix}_${reg.name.toUpperCase()}_OFFSET = 32'h${reg.offset.toString(16).padStart(8, '0')};`);
      for (const field of reg.fields) {
        lines.push(`  localparam int ${prefix}_${reg.name.toUpperCase()}_${field.name.toUpperCase()}_LSB = ${field.lsb};`);
      }
    }
    lines.push('endpackage');
    return lines.join('\n');
  }

  generateCHeader(map: RegisterMap): string {
    this.assertValid(map);
    const guard = `${map.name.toUpperCase()}_REGS_H`;
    const prefix = map.name.toUpperCase();
    const lines = [`#ifndef ${guard}`, `#define ${guard}`, ''];
    for (const reg of map.registers) {
      lines.push(`#define ${prefix}_${reg.name.toUpperCase()}_OFFSET 0x${reg.offset.toString(16).padStart(8, '0')}u`);
      for (const field of reg.fields) {
        const mask = this.fieldMask(field);
        lines.push(`#define ${prefix}_${reg.name.toUpperCase()}_${field.name.toUpperCase()}_MASK 0x${mask.toString(16).padStart(8, '0')}u`);
      }
    }
    lines.push('', `#endif /* ${guard} */`);
    return lines.join('\n');
  }

  generateRust(map: RegisterMap): string {
    this.assertValid(map);
    const lines: string[] = [];
    for (const reg of map.registers) {
      lines.push(`pub const ${reg.name.toUpperCase()}_OFFSET: u32 = 0x${reg.offset.toString(16)};`);
      for (const field of reg.fields) {
        lines.push(`pub const ${reg.name.toUpperCase()}_${field.name.toUpperCase()}_MASK: u32 = 0x${this.fieldMask(field).toString(16)};`);
      }
    }
    return lines.join('\n');
  }

  generateMarkdown(map: RegisterMap): string {
    this.assertValid(map);
    const lines = [`# ${map.name} Register Map`, '', '| Offset | Register | Field | Bits | Access | Reset | Description |', '|---:|---|---|---:|---|---:|---|'];
    for (const reg of map.registers) {
      for (const field of reg.fields) {
        const bits = field.width === 1 ? `${field.lsb}` : `${field.lsb + field.width - 1}:${field.lsb}`;
        lines.push(`| 0x${reg.offset.toString(16)} | ${reg.name} | ${field.name} | ${bits} | ${field.access} | ${field.reset ?? 0} | ${field.description ?? ''} |`);
      }
    }
    return lines.join('\n');
  }

  private fieldMask(field: RegisterField): number {
    if (field.width >= 32) return 0xffffffff >>> 0;
    return (((2 ** field.width) - 1) << field.lsb) >>> 0;
  }

  private assertValid(map: RegisterMap): void {
    const result = this.validate(map);
    if (!result.valid) throw new Error(`Invalid register map: ${result.errors.join('; ')}`);
  }
}

export class PpaExplorer {
  compare(baseline: PpaCandidate, candidates: PpaCandidate[], weights: PpaWeights = { area: 0.25, power: 0.25, performance: 0.30, timing: 0.20 }): PpaComparisonRow[] {
    const totalWeight = weights.area + weights.power + weights.performance + weights.timing || 1;
    return candidates.map((candidate) => {
      const deltas: PpaMetrics = {
        area: this.delta(candidate.metrics.area, baseline.metrics.area),
        powerMw: this.delta(candidate.metrics.powerMw, baseline.metrics.powerMw),
        fmaxMhz: this.delta(candidate.metrics.fmaxMhz, baseline.metrics.fmaxMhz),
        wnsNs: candidate.metrics.wnsNs !== undefined && baseline.metrics.wnsNs !== undefined ? candidate.metrics.wnsNs - baseline.metrics.wnsNs : undefined,
      };
      const areaScore = this.lowerIsBetter(candidate.metrics.area, baseline.metrics.area);
      const powerScore = this.lowerIsBetter(candidate.metrics.powerMw, baseline.metrics.powerMw);
      const perfScore = this.higherIsBetter(candidate.metrics.fmaxMhz, baseline.metrics.fmaxMhz);
      const timingScore = this.timingScore(candidate.metrics.wnsNs, baseline.metrics.wnsNs);
      const score = (areaScore * weights.area + powerScore * weights.power + perfScore * weights.performance + timingScore * weights.timing) / totalWeight;
      return { ...candidate, deltas, score: Math.round(score * 100) / 100 };
    }).sort((a, b) => b.score - a.score);
  }

  private delta(value?: number, baseline?: number): number | undefined {
    if (value === undefined || baseline === undefined || baseline === 0) return undefined;
    return Math.round((value / baseline - 1) * 10000) / 100;
  }
  private lowerIsBetter(value?: number, baseline?: number): number { return value === undefined || baseline === undefined || value <= 0 ? 50 : clampPercent(baseline / value * 100); }
  private higherIsBetter(value?: number, baseline?: number): number { return value === undefined || baseline === undefined || baseline <= 0 ? 50 : clampPercent(value / baseline * 100); }
  private timingScore(value?: number, baseline?: number): number {
    if (value === undefined) return 50;
    if (value >= 0) return 100;
    if (baseline !== undefined && value > baseline) return 75;
    return Math.max(0, 50 + value * 100);
  }
}

export class FormalAssistant {
  fifoNoUnderflow(clock = 'clk', reset = 'rst_n', readEnable = 'read_en', empty = 'empty'): FormalProperty {
    return {
      name: 'no_fifo_underflow',
      description: 'A FIFO read may only occur when the FIFO is non-empty.',
      sva: `property no_fifo_underflow;\n  @(posedge ${clock}) disable iff (!${reset})\n  ${readEnable} |-> !${empty};\nendproperty\nassert property (no_fifo_underflow);`,
    };
  }

  fifoNoOverflow(clock = 'clk', reset = 'rst_n', writeEnable = 'write_en', full = 'full'): FormalProperty {
    return {
      name: 'no_fifo_overflow',
      description: 'A FIFO write may only occur when the FIFO is non-full.',
      sva: `property no_fifo_overflow;\n  @(posedge ${clock}) disable iff (!${reset})\n  ${writeEnable} |-> !${full};\nendproperty\nassert property (no_fifo_overflow);`,
    };
  }

  eventualResponse(request: string, response: string, maxCycles: number, clock = 'clk', reset = 'rst_n'): FormalProperty {
    if (!Number.isInteger(maxCycles) || maxCycles < 1) throw new Error('maxCycles must be a positive integer');
    return {
      name: `eventual_${response}`,
      description: `${response} must occur within ${maxCycles} cycles of ${request}.`,
      sva: `property eventual_${response};\n  @(posedge ${clock}) disable iff (!${reset})\n  ${request} |-> ##[1:${maxCycles}] ${response};\nendproperty\nassert property (eventual_${response});`,
    };
  }
}

export class VerificationPlanGenerator {
  fromDesignGraph(graph: DesignGraph): string[] {
    const top = graph.modules[graph.topModule];
    if (!top) return [];
    const plan = [
      `Reset behavior for ${graph.topModule}`,
      `Nominal datapath behavior for ${graph.topModule}`,
    ];
    for (const fsm of top.fsms) {
      for (const transition of fsm.transitions) plan.push(`FSM ${fsm.name}: ${transition.from} -> ${transition.to}${transition.condition ? ` when ${transition.condition}` : ''}`);
    }
    for (const instance of top.instances) plan.push(`Interface/integration behavior for instance ${instance.name}:${instance.moduleName}`);
    for (const output of top.ports.filter((p) => p.direction === 'output')) plan.push(`Output ${output.name} correctness and boundary values`);
    return [...new Set(plan)];
  }
}

export type * from './types.js';
