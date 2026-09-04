import type { DesignGraph, SourceLocation } from '@nayvid/design-ir';
import type { WaveformModel } from './types.js';

export interface SignalIntelligenceContext {
  signalName: string;
  declared?: SourceLocation;
  drivers: SourceLocation[];
  loads: SourceLocation[];
  expression?: string;
  dependsOn: string[];
  waveformValueAtTime?: string | number;
  relevantTransition?: {
    fromState?: string;
    toState?: string;
    condition?: string;
  };
  suspectedCause?: string;
}

export function extractSignalIntelligence(
  signalName: string,
  graph: DesignGraph,
  waveform?: WaveformModel,
  atTimeNs?: number
): SignalIntelligenceContext {
  const topModule = graph.modules[graph.topModule];
  if (!topModule) {
    return {
      signalName,
      drivers: [],
      loads: [],
      dependsOn: [],
    };
  }

  const sig = topModule.signals.find((s) => s.name === signalName);
  const port = topModule.ports.find((p) => p.name === signalName);

  const declared = sig?.location || port?.location || { file: topModule.file, line: 1 };
  const drivers = sig?.drivers || [];
  const loads = sig?.loads || [];

  const dependsOn: string[] = [];
  topModule.signals.forEach((s) => {
    if (s.name !== signalName && s.loads.some((l) => drivers.some((d) => d.line === l.line))) {
      dependsOn.push(s.name);
    }
  });

  let waveformValueAtTime: string | number | undefined;
  if (waveform) {
    const waveSig = waveform.signals.find((s) => s.name === signalName);
    if (waveSig && waveSig.wave.length > 0) {
      if (atTimeNs === undefined) {
        waveformValueAtTime = waveSig.wave[waveSig.wave.length - 1].value;
      } else {
        const pastValues = waveSig.wave.filter((w) => w.timeNs <= atTimeNs);
        waveformValueAtTime = pastValues.length > 0 ? pastValues[pastValues.length - 1].value : waveSig.wave[0].value;
      }
    }
  }

  let relevantTransition: { fromState?: string; toState?: string; condition?: string } | undefined;
  if (topModule.fsms.length > 0) {
    const fsm = topModule.fsms[0];
    if (fsm.transitions.length > 0) {
      const trans = fsm.transitions[0];
      relevantTransition = {
        fromState: trans.from,
        toState: trans.to,
        condition: trans.condition,
      };
    }
  }

  const expression = drivers.length > 0
    ? `driver at line ${drivers[0].line}`
    : port ? `${port.direction} port` : 'internal signal';

  const suspectedCause = waveformValueAtTime === 0 || waveformValueAtTime === '0'
    ? `Signal '${signalName}' stayed low due to unsatisfied enable condition or missing trigger.`
    : `Signal '${signalName}' active value ${waveformValueAtTime} detected.`;

  return {
    signalName,
    declared,
    drivers,
    loads,
    expression,
    dependsOn,
    waveformValueAtTime,
    relevantTransition,
    suspectedCause,
  };
}
