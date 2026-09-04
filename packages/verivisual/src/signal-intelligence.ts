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
  previousWaveformValue?: string | number;
  lastTransitionTimeNs?: number;
  relevantTransition?: {
    fromState?: string;
    toState?: string;
    condition?: string;
    location?: SourceLocation;
  };
  suspectedCause?: string;
}

function findSignal(graph: DesignGraph, signalName: string) {
  for (const module of Object.values(graph.modules)) {
    const sig = module.signals.find((s) => s.name === signalName);
    const port = module.ports.find((p) => p.name === signalName);
    if (sig || port) return { module, sig, port };
  }
  return undefined;
}

export function extractSignalIntelligence(
  signalName: string,
  graph: DesignGraph,
  waveform?: WaveformModel,
  atTimeNs?: number
): SignalIntelligenceContext {
  const found = findSignal(graph, signalName);
  if (!found) {
    return { signalName, drivers: [], loads: [], dependsOn: [] };
  }

  const { module, sig, port } = found;
  const declared = sig?.location || port?.location || { file: module.file, line: 1 };
  const drivers = sig?.drivers || [];
  const loads = sig?.loads || [];
  const dependsOn = [...new Set(sig?.dependsOn || sig?.driverExpressions?.flatMap((d) => d.dependencies) || [])];
  const expression = sig?.driverExpressions?.[0]?.expression || (port ? `${port.direction} port` : undefined);

  let waveformValueAtTime: string | number | undefined;
  let previousWaveformValue: string | number | undefined;
  let lastTransitionTimeNs: number | undefined;

  if (waveform) {
    const waveSig = waveform.signals.find((s) => s.name === signalName || s.fullName === signalName);
    if (waveSig?.wave.length) {
      const limit = atTimeNs ?? Number.POSITIVE_INFINITY;
      const pastValues = waveSig.wave.filter((w) => w.timeNs <= limit);
      if (pastValues.length) {
        waveformValueAtTime = pastValues[pastValues.length - 1].value;
        if (pastValues.length > 1) previousWaveformValue = pastValues[pastValues.length - 2].value;
        for (let i = pastValues.length - 1; i > 0; i--) {
          if (pastValues[i].value !== pastValues[i - 1].value) {
            lastTransitionTimeNs = pastValues[i].timeNs;
            break;
          }
        }
      }
    }
  }

  let relevantTransition: SignalIntelligenceContext['relevantTransition'];
  for (const fsm of module.fsms) {
    const transition = fsm.transitions.find((t) =>
      t.condition?.includes(signalName) ||
      fsm.stateRegister === signalName ||
      dependsOn.includes(fsm.stateRegister)
    ) || fsm.transitions[0];
    if (transition) {
      relevantTransition = {
        fromState: transition.from,
        toState: transition.to,
        condition: transition.condition,
        location: transition.location,
      };
      break;
    }
  }

  let suspectedCause: string | undefined;
  if (drivers.length === 0 && port?.direction !== 'input') {
    suspectedCause = `No RTL driver was found for '${signalName}'.`;
  } else if (waveformValueAtTime === 0 || waveformValueAtTime === '0') {
    suspectedCause = dependsOn.length
      ? `Signal '${signalName}' is low; inspect dependencies: ${dependsOn.join(', ')}.`
      : `Signal '${signalName}' is low at the selected time; inspect its driver expression and control conditions.`;
  } else if (waveformValueAtTime !== undefined) {
    suspectedCause = `Signal '${signalName}' has value ${waveformValueAtTime} at the selected time.`;
  }

  return {
    signalName,
    declared,
    drivers,
    loads,
    expression,
    dependsOn,
    waveformValueAtTime,
    previousWaveformValue,
    lastTransitionTimeNs,
    relevantTransition,
    suspectedCause,
  };
}
