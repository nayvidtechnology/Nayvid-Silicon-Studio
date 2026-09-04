import type { ArtifactRef, RunKind, RunRecord, SignoffEvidence } from './types.js';

export type MetricKind = 'coverage' | 'cdc' | 'unconstrained-paths' | 'wns' | 'traceability';

export interface MetricEvidenceDocument {
  schemaVersion: 1;
  kind: MetricKind;
  value: number;
  unit: '%' | 'count' | 'ns';
  sourceRunId?: string;
  toolId?: string;
  generatedAt: string;
}

export interface RecordedSignoffEvidence {
  evidence: SignoffEvidence;
  runIds: Partial<Record<RunKind, string>>;
  metricArtifacts: Partial<Record<MetricKind, string>>;
  blockers: string[];
}

interface ArtifactStoreLike {
  put(logicalName: string, data: string | Buffer, mediaType?: string): ArtifactRef;
  read(ref: ArtifactRef): Buffer;
}

const EXPECTED_UNITS: Record<MetricKind, MetricEvidenceDocument['unit']> = {
  coverage: '%',
  cdc: 'count',
  'unconstrained-paths': 'count',
  wns: 'ns',
  traceability: '%',
};

export class MetricEvidenceStore {
  constructor(private artifacts: ArtifactStoreLike) {}

  put(kind: MetricKind, value: number, sourceRunId?: string, toolId?: string): ArtifactRef {
    if (!Number.isFinite(value)) throw new Error(`Metric '${kind}' must be finite`);
    if ((kind === 'coverage' || kind === 'traceability') && (value < 0 || value > 100)) throw new Error(`Metric '${kind}' must be between 0 and 100`);
    if ((kind === 'cdc' || kind === 'unconstrained-paths') && (!Number.isInteger(value) || value < 0)) throw new Error(`Metric '${kind}' must be a non-negative integer`);
    const doc: MetricEvidenceDocument = {
      schemaVersion: 1,
      kind,
      value,
      unit: EXPECTED_UNITS[kind],
      sourceRunId,
      toolId,
      generatedAt: new Date().toISOString(),
    };
    return this.artifacts.put(`${kind}.metric.json`, JSON.stringify(doc), 'application/vnd.nayvid.metric+json');
  }

  read(ref: ArtifactRef): MetricEvidenceDocument {
    const data = this.artifacts.read(ref);
    const doc = JSON.parse(data.toString('utf-8')) as MetricEvidenceDocument;
    if (doc.schemaVersion !== 1 || !EXPECTED_UNITS[doc.kind]) throw new Error(`Invalid metric evidence schema in ${ref.logicalName}`);
    if (doc.unit !== EXPECTED_UNITS[doc.kind]) throw new Error(`Invalid unit for metric '${doc.kind}'`);
    if (!Number.isFinite(doc.value)) throw new Error(`Metric '${doc.kind}' is not finite`);
    return doc;
  }
}

function latestTerminalRun(runs: RunRecord[], kind: RunKind, expectedProjectDigest?: string): RunRecord | undefined {
  return runs
    .filter((run) => run.kind === kind && ['passed', 'failed', 'cancelled'].includes(run.status) && (!expectedProjectDigest || run.projectDigest === expectedProjectDigest))
    .sort((a, b) => (b.completedAt ?? b.startedAt).localeCompare(a.completedAt ?? a.startedAt))[0];
}

export class RecordedSignoffEvidenceCollector {
  constructor(private artifacts: ArtifactStoreLike) {}

  collect(runs: RunRecord[], metricRefs: ArtifactRef[], expectedProjectDigest?: string): RecordedSignoffEvidence {
    const runIds: Partial<Record<RunKind, string>> = {};
    const blockers: string[] = [];
    const evidence: SignoffEvidence = {};

    if (expectedProjectDigest) {
      const foreignTerminalRuns = runs.filter((run) => ['passed', 'failed', 'cancelled'].includes(run.status) && run.projectDigest !== expectedProjectDigest);
      if (foreignTerminalRuns.length) blockers.push(`${foreignTerminalRuns.length} terminal run(s) belong to a different project digest`);
    }

    const runGates: Array<[RunKind, 'compilePassed' | 'simulationPassed' | 'formalPassed' | 'synthesisPassed']> = [
      ['compile', 'compilePassed'],
      ['simulation', 'simulationPassed'],
      ['formal', 'formalPassed'],
      ['synthesis', 'synthesisPassed'],
    ];
    for (const [kind, field] of runGates) {
      const run = latestTerminalRun(runs, kind, expectedProjectDigest);
      if (!run) continue;
      runIds[kind] = run.id;
      evidence[field] = run.status === 'passed';
    }

    const metricStore = new MetricEvidenceStore(this.artifacts);
    const metricArtifacts: Partial<Record<MetricKind, string>> = {};
    const byKind = new Map<MetricKind, { doc: MetricEvidenceDocument; ref: ArtifactRef }>();
    for (const ref of metricRefs) {
      try {
        const doc = metricStore.read(ref);
        const previous = byKind.get(doc.kind);
        if (!previous || doc.generatedAt >= previous.doc.generatedAt) byKind.set(doc.kind, { doc, ref });
      } catch (err: any) {
        blockers.push(`Invalid metric artifact ${ref.logicalName}: ${err?.message || String(err)}`);
      }
    }

    for (const [kind, item] of byKind) {
      metricArtifacts[kind] = item.ref.digest;
      if (item.doc.sourceRunId) {
        const sourceRun = runs.find((run) => run.id === item.doc.sourceRunId);
        if (!sourceRun) blockers.push(`Metric '${kind}' references unknown run ${item.doc.sourceRunId}`);
        else if (expectedProjectDigest && sourceRun.projectDigest !== expectedProjectDigest) blockers.push(`Metric '${kind}' references a run from a different project digest`);
        else if (sourceRun.status !== 'passed') blockers.push(`Metric '${kind}' references non-passing run ${sourceRun.id}`);
      }
      switch (kind) {
        case 'coverage': evidence.coveragePercent = item.doc.value; break;
        case 'cdc': evidence.cdcIssues = item.doc.value; break;
        case 'unconstrained-paths': evidence.unconstrainedPaths = item.doc.value; break;
        case 'wns': evidence.wnsNs = item.doc.value; break;
        case 'traceability': evidence.traceabilityPercent = item.doc.value; break;
      }
    }

    return { evidence, runIds, metricArtifacts, blockers };
  }
}
