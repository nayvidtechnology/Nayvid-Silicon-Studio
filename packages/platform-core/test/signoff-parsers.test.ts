import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CdcReportParser,
  ContentAddressedArtifactStore,
  CoverageReportParser,
  DrcLvsReportParser,
  MetricEvidenceStore,
  PowerReportParser,
  SignoffReportIngestionService,
  StaReportParser,
} from '../src/index.js';

describe('Real EDA Sign-off Parsers Hardening', () => {
  let tmpDir: string;
  let artifactStore: ContentAddressedArtifactStore;
  let metricStore: MetricEvidenceStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signoff-parser-test-'));
    artifactStore = new ContentAddressedArtifactStore(tmpDir);
    metricStore = new MetricEvidenceStore(artifactStore);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses realistic PrimeTime/Tempus STA timing report fixtures', () => {
    const parser = new StaReportParser();
    const ptFixture = `
****************************************
Report : timing
        -path_type full
        -delay_type max
Design : top_core
Scenario: func_max
****************************************

  Startpoint: u_alu/reg_a_reg[15] (rising edge-triggered flip-flop)
  Endpoint: u_alu/res_reg[31] (rising edge-triggered flip-flop)
  Path Group: clk_main
  Path Type: max

  Point                                                   Incr       Path
  -----------------------------------------------------------------------
  clock clk_main (rise edge)                              0.00       0.00
  clock network delay (propagated)                        0.18       0.18
  u_alu/reg_a_reg[15]/CP (DFF_X1)                         0.00       0.18 r
  u_alu/reg_a_reg[15]/Q (DFF_X1)                          0.14       0.32 f
  u_alu/U102/Y (NAND2_X1)                                 0.08       0.40 r
  u_alu/res_reg[31]/D (DFF_X1)                            0.22       1.85 r
  data arrival time                                                  1.85

  clock clk_main (rise edge)                              2.00       2.00
  clock network delay (propagated)                        0.15       2.15
  clock uncertainty                                      -0.05       2.10
  u_alu/res_reg[31]/setup (DFF_X1)                       -0.08       2.02
  data required time                                                 2.02
  -----------------------------------------------------------------------
  data required time                                                 2.02
  data arrival time                                                 -1.85
  -----------------------------------------------------------------------
  slack (MET : 0.17)
  unconstrained paths: 0
    `;

    const metrics = parser.parse(ptFixture);
    const wns = metrics.find((m) => m.kind === 'wns');
    const unconstrained = metrics.find((m) => m.kind === 'unconstrained-paths');

    expect(wns?.value).toBe(0.17);
    expect(unconstrained?.value).toBe(0);
  });

  it('handles malformed or empty reports without throwing errors', () => {
    const staParser = new StaReportParser();
    expect(staParser.parse('Random log text without timing slack')).toEqual([]);

    const cdcParser = new CdcReportParser();
    expect(cdcParser.parse('Unrelated console output')[0].value).toBe(0);

    const covParser = new CoverageReportParser();
    expect(covParser.parse('No coverage metric here')).toEqual([]);
  });

  it('parses realistic CDC violations fixture', () => {
    const parser = new CdcReportParser();
    const cdcFixture = `
-----------------------------------------------------------------
Cadence Conquest / Synopsys SpyGlass CDC Analysis Report
Design: axi_bridge
-----------------------------------------------------------------
Crossings evaluated: 142
Synchronized: 139
Unsynchronized crossings: 3
Total CDC Violations: 3
-----------------------------------------------------------------
    `;
    const metrics = parser.parse(cdcFixture);
    expect(metrics[0].value).toBe(3);
  });

  it('parses realistic Coverage fixture', () => {
    const parser = new CoverageReportParser();
    const covFixture = `
=================================================================
Summary Coverage Results (Questa / VCS)
=================================================================
Line Coverage:       98.2%
Toggle Coverage:     92.1%
FSM Coverage:        91.0%
-----------------------------------------------------------------
TOTAL COVERAGE: 93.7%
=================================================================
    `;
    const metrics = parser.parse(covFixture);
    expect(metrics[0].value).toBe(93.7);
  });

  it('ingests report metrics directly into MetricEvidenceStore', () => {
    const ingestion = new SignoffReportIngestionService(metricStore);
    const staRefs = ingestion.ingestStaReport('slack (MET : 0.45)\nunconstrained paths: 0', 'run-1', 'primetime');
    expect(staRefs.length).toBe(2);

    const wnsDoc = metricStore.read(staRefs[0]);
    expect(wnsDoc.kind).toBe('wns');
    expect(wnsDoc.value).toBe(0.45);
  });
});
