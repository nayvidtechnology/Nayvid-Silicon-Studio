import { describe, expect, it } from 'vitest';
import {
  DesignHealthEngine,
  FormalAssistant,
  PpaExplorer,
  RegisterMapGenerator,
  TraceabilityMatrix,
  VerificationCockpit,
  VerificationPlanGenerator,
} from '../src/index.js';
import type { DesignGraph } from '@nayvid/design-ir';

describe('advanced silicon engineering features', () => {
  it('summarizes verification results and identifies weak coverage', () => {
    const cockpit = new VerificationCockpit();
    const summary = cockpit.summarize({
      tests: [{ name: 'smoke', status: 'pass' }, { name: 'overflow', status: 'pass' }],
      assertions: [{ name: 'no_overflow', status: 'pass' }],
      coverage: { line: 95, branch: 88, functional: 92 },
    });
    expect(summary.status).toBe('healthy');
    expect(summary.testsFailed).toBe(0);
    expect(cockpit.uncoveredAreas({ line: 95, branch: 61, functional: 80 }, 90)).toEqual(['branch: 61%', 'functional: 80%']);
  });

  it('creates weighted design health and identifies sign-off blockers', () => {
    const engine = new DesignHealthEngine();
    const report = engine.evaluate({
      compile: 'pass', lint: 'pass', simulation: 'fail', assertions: 'pass',
      coveragePercent: 84, cdcIssues: 0, unconstrainedPaths: 2, combinationalLoops: 0, timingWnsNs: -0.1,
    });
    expect(report.score).toBeGreaterThan(50);
    expect(report.blockers).toContain('Simulation');
    expect(report.checks.find((c) => c.id === 'timing')?.status).toBe('warning');
  });

  it('tracks requirement-to-RTL-to-test/assertion traceability and gaps', () => {
    const matrix = new TraceabilityMatrix();
    const results = matrix.analyze([
      { id: 'UART-1', text: 'TX shall support parity', implementation: ['rtl/uart_tx.sv'], tests: ['tb/parity.py'], assertions: ['sva/parity.sva'] },
      { id: 'UART-2', text: 'RX shall detect framing errors', implementation: ['rtl/uart_rx.sv'], tests: [], assertions: [] },
    ]);
    expect(results[0].status).toBe('verified');
    expect(results[1].status).toBe('unverified');
    expect(results[1].gaps).toContain('No test link');
    expect(matrix.coverage(results)).toBe(50);
  });

  it('validates register maps and generates SV, C, Rust and documentation artifacts', () => {
    const generator = new RegisterMapGenerator();
    const map = {
      name: 'uart',
      registers: [
        { name: 'CONTROL', offset: 0, fields: [
          { name: 'ENABLE', lsb: 0, width: 1, access: 'RW' as const, reset: 0 },
          { name: 'PARITY', lsb: 1, width: 2, access: 'RW' as const, reset: 0 },
        ] },
        { name: 'STATUS', offset: 4, fields: [
          { name: 'BUSY', lsb: 0, width: 1, access: 'RO' as const, reset: 0 },
        ] },
      ],
    };
    expect(generator.validate(map).valid).toBe(true);
    expect(generator.generateSystemVerilogPackage(map)).toContain('UART_CONTROL_OFFSET');
    expect(generator.generateCHeader(map)).toContain('UART_CONTROL_ENABLE_MASK');
    expect(generator.generateRust(map)).toContain('CONTROL_PARITY_MASK');
    expect(generator.generateMarkdown(map)).toContain('| 0x4 | STATUS | BUSY |');
  });

  it('rejects overlapping and misaligned register definitions', () => {
    const generator = new RegisterMapGenerator();
    const result = generator.validate({
      name: 'bad',
      registers: [
        { name: 'A', offset: 2, fields: [
          { name: 'F0', lsb: 0, width: 2, access: 'RW' },
          { name: 'F1', lsb: 1, width: 2, access: 'RW' },
        ] },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('aligned'))).toBe(true);
    expect(result.errors.some((e) => e.includes('overlaps'))).toBe(true);
  });

  it('compares PPA candidates and ranks stronger options first', () => {
    const explorer = new PpaExplorer();
    const rows = explorer.compare(
      { name: 'baseline', metrics: { area: 100, powerMw: 30, fmaxMhz: 200, wnsNs: -0.1 } },
      [
        { name: 'power-opt', metrics: { area: 95, powerMw: 20, fmaxMhz: 205, wnsNs: 0.05 } },
        { name: 'slow', metrics: { area: 110, powerMw: 35, fmaxMhz: 150, wnsNs: -0.4 } },
      ]
    );
    expect(rows[0].name).toBe('power-opt');
    expect(rows[0].deltas.powerMw).toBeLessThan(0);
    expect(rows[0].score).toBeGreaterThan(rows[1].score);
  });

  it('generates reusable SVA formal properties with bounded liveness', () => {
    const formal = new FormalAssistant();
    expect(formal.fifoNoUnderflow().sva).toContain('read_en |-> !empty');
    expect(formal.fifoNoOverflow().sva).toContain('write_en |-> !full');
    expect(formal.eventualResponse('req', 'ack', 8).sva).toContain('##[1:8] ack');
    expect(() => formal.eventualResponse('req', 'ack', 0)).toThrow(/positive integer/);
  });

  it('generates a verification plan from real design graph structure', () => {
    const graph: DesignGraph = {
      topModule: 'uart',
      modules: {
        uart: {
          name: 'uart', file: 'rtl/uart.sv',
          ports: [
            { name: 'clk', direction: 'input', width: 1 },
            { name: 'tx', direction: 'output', width: 1 },
          ],
          signals: [],
          instances: [{ name: 'fifo0', moduleName: 'fifo', portConnections: {} }],
          fsms: [{ name: 'tx_fsm', stateRegister: 'state', states: [{ name: 'IDLE' }, { name: 'SEND' }], transitions: [{ from: 'IDLE', to: 'SEND', condition: 'start' }] }],
          clockDomains: ['clk'], resetDomains: ['rst_n'],
        },
      },
    };
    const plan = new VerificationPlanGenerator().fromDesignGraph(graph);
    expect(plan.some((item) => item.includes('IDLE -> SEND'))).toBe(true);
    expect(plan.some((item) => item.includes('fifo0:fifo'))).toBe(true);
    expect(plan.some((item) => item.includes('Output tx'))).toBe(true);
  });
});
