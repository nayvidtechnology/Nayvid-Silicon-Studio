import type { ArtifactRef } from './types.js';
import { MetricEvidenceStore, type MetricKind } from './signoff-evidence.js';

export interface ParsedMetricResult {
  kind: MetricKind;
  value: number;
  details?: Record<string, unknown>;
}

export class StaReportParser {
  parse(reportText: string): ParsedMetricResult[] {
    const results: ParsedMetricResult[] = [];

    // Parse WNS
    const wnsMatch = reportText.match(/slack\s*\((?:VIOLATED|MET)\s*[:=]?\s*([+-]?[\d\.]+)\)/i) ??
                     reportText.match(/wns\s*[:=]?\s*([+-]?[\d\.]+)\s*ns/i) ??
                     reportText.match(/worst\s+slack\s*[:=]?\s*([+-]?[\d\.]+)/i);
    if (wnsMatch) {
      results.push({ kind: 'wns', value: parseFloat(wnsMatch[1]) });
    }

    // Parse Unconstrained Paths
    const unconstrainedMatch = reportText.match(/unconstrained\s+paths\s*[:=]?\s*(\d+)/i) ??
                               reportText.match(/no\s+clock\s+paths\s*[:=]?\s*(\d+)/i);
    if (unconstrainedMatch) {
      results.push({ kind: 'unconstrained-paths', value: parseInt(unconstrainedMatch[1], 10) });
    }

    return results;
  }
}

export class CdcReportParser {
  parse(reportText: string): ParsedMetricResult[] {
    const match = reportText.match(/total\s+(?:cdc\s+)?violations?\s*[:=]?\s*(\d+)/i) ??
                  reportText.match(/violations?\s+found\s*[:=]?\s*(\d+)/i) ??
                  reportText.match(/unsynchronized\s+crossings?\s*[:=]?\s*(\d+)/i);
    const count = match ? parseInt(match[1], 10) : 0;
    return [{ kind: 'cdc', value: count }];
  }
}

export class CoverageReportParser {
  parse(reportText: string): ParsedMetricResult[] {
    const match = reportText.match(/(?:overall|total|weighted)\s+coverage\s*[:=]?\s*([\d\.]+)\s*%/i) ??
                  reportText.match(/score\s*[:=]?\s*([\d\.]+)\s*%/i);
    if (match) {
      const val = parseFloat(match[1]);
      return [{ kind: 'coverage', value: Math.min(100, Math.max(0, val)) }];
    }
    return [];
  }
}

export class DrcLvsReportParser {
  parseDrc(reportText: string): { violations: number } {
    const match = reportText.match(/total\s+drc\s+results?\s*[:=]?\s*(\d+)/i) ??
                  reportText.match(/drc\s+errors?\s*[:=]?\s*(\d+)/i) ??
                  reportText.match(/clean/i);
    if (match) {
      if (match[0].toLowerCase().includes('clean')) return { violations: 0 };
      return { violations: parseInt(match[1], 10) };
    }
    return { violations: 0 };
  }

  parseLvs(reportText: string): { clean: boolean } {
    return { clean: /lvs\s+status\s*[:=]?\s*correct/i.test(reportText) || /netlist\s+matches\s+layout/i.test(reportText) };
  }
}

export class PowerReportParser {
  parse(reportText: string): { totalPowerMw: number } {
    const match = reportText.match(/total\s+power\s*[:=]?\s*([\d\.]+)\s*(mw|u|w)?/i);
    if (match) {
      let val = parseFloat(match[1]);
      const unit = (match[2] ?? 'mw').toLowerCase();
      if (unit === 'w') val *= 1000;
      else if (unit === 'u' || unit === 'uw') val /= 1000;
      return { totalPowerMw: val };
    }
    return { totalPowerMw: 0 };
  }
}

export class SignoffReportIngestionService {
  constructor(private metricStore: MetricEvidenceStore) {}

  ingestStaReport(reportText: string, sourceRunId?: string, toolId?: string): ArtifactRef[] {
    const parser = new StaReportParser();
    const metrics = parser.parse(reportText);
    return metrics.map((m) => this.metricStore.put(m.kind, m.value, sourceRunId, toolId));
  }

  ingestCdcReport(reportText: string, sourceRunId?: string, toolId?: string): ArtifactRef {
    const parser = new CdcReportParser();
    const [metric] = parser.parse(reportText);
    return this.metricStore.put('cdc', metric ? metric.value : 0, sourceRunId, toolId);
  }

  ingestCoverageReport(reportText: string, sourceRunId?: string, toolId?: string): ArtifactRef | undefined {
    const parser = new CoverageReportParser();
    const [metric] = parser.parse(reportText);
    if (!metric) return undefined;
    return this.metricStore.put('coverage', metric.value, sourceRunId, toolId);
  }
}
