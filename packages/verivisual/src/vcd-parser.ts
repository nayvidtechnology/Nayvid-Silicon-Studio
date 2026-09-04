import type { WaveformModel, WaveformSignal, WaveformSignalValue } from './types.js';

export function parseVcdTimescaleMultiplier(timescaleStr: string): number {
  const match = timescaleStr.match(/(\d+)\s*([a-zA-Z]+)/);
  if (!match) return 1;
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 's': return num * 1e9;
    case 'ms': return num * 1e6;
    case 'us': return num * 1e3;
    case 'ns': return num;
    case 'ps': return num * 1e-3;
    case 'fs': return num * 1e-6;
    default: return 1;
  }
}

interface VcdVarMeta {
  id: string;
  type: string;
  width: number;
  name: string;
  fullName: string;
}

function normalizeTimescale(raw: string): string {
  return raw.replace(/\s+/g, '');
}

function decodeVector(bits: string): string | number {
  if (/[xz]/i.test(bits)) return `0b${bits.toLowerCase()}`;
  const parsed = parseInt(bits, 2);
  return Number.isSafeInteger(parsed) ? parsed : `0b${bits}`;
}

export function parseVcd(vcdContent: string): WaveformModel {
  if (!vcdContent || !vcdContent.trim()) {
    return { timescale: '1ns', signals: [], startTimeNs: 0, endTimeNs: 0 };
  }

  let timescale = '1ns';
  let timescaleMultiplier = 1;
  let currentTimeNs = 0;
  let startTimeNs = Number.POSITIVE_INFINITY;
  let endTimeNs = 0;
  const scopes: string[] = [];
  const varsById = new Map<string, VcdVarMeta>();
  const valuesById = new Map<string, WaveformSignalValue[]>();

  const lines = vcdContent.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('$timescale')) {
      let raw = line;
      while (!raw.includes('$end') && i + 1 < lines.length) raw += ` ${lines[++i].trim()}`;
      const match = raw.match(/\$timescale\s+(.+?)\s+\$end/);
      if (match) {
        timescale = normalizeTimescale(match[1]);
        timescaleMultiplier = parseVcdTimescaleMultiplier(timescale);
      }
      continue;
    }

    if (line.startsWith('$scope')) {
      const match = line.match(/\$scope\s+\w+\s+(\S+)\s+\$end/);
      if (match) scopes.push(match[1]);
      continue;
    }

    if (line.startsWith('$upscope')) {
      scopes.pop();
      continue;
    }

    if (line.startsWith('$var')) {
      const match = line.match(/\$var\s+(\w+)\s+(\d+)\s+(\S+)\s+(\S+)(?:\s+\[[^\]]+\])?\s+\$end/);
      if (match) {
        const [, type, widthText, id, name] = match;
        const fullName = [...scopes, name].join('.');
        varsById.set(id, { id, type, width: parseInt(widthText, 10), name, fullName });
        valuesById.set(id, []);
      }
      continue;
    }

    if (line.startsWith('#')) {
      const raw = parseInt(line.slice(1), 10);
      if (!Number.isNaN(raw)) {
        currentTimeNs = raw * timescaleMultiplier;
        startTimeNs = Math.min(startTimeNs, currentTimeNs);
        endTimeNs = Math.max(endTimeNs, currentTimeNs);
      }
      continue;
    }

    // Ignore VCD directives such as $dumpvars while still parsing the value lines that follow.
    if (line.startsWith('$')) continue;

    const scalar = line.match(/^([01xXzZ])(\S+)$/);
    if (scalar) {
      const [, rawValue, id] = scalar;
      const wave = valuesById.get(id);
      if (wave) {
        const value = rawValue === '1' ? 1 : rawValue === '0' ? 0 : rawValue.toLowerCase();
        wave.push({ timeNs: currentTimeNs, value });
        startTimeNs = Math.min(startTimeNs, currentTimeNs);
      }
      continue;
    }

    const vector = line.match(/^b([01xXzZ]+)\s+(\S+)$/);
    if (vector) {
      const wave = valuesById.get(vector[2]);
      if (wave) {
        wave.push({ timeNs: currentTimeNs, value: decodeVector(vector[1]) });
        startTimeNs = Math.min(startTimeNs, currentTimeNs);
      }
      continue;
    }

    const real = line.match(/^r([^\s]+)\s+(\S+)$/i);
    if (real) {
      const wave = valuesById.get(real[2]);
      if (wave) {
        const value = Number(real[1]);
        wave.push({ timeNs: currentTimeNs, value: Number.isNaN(value) ? real[1] : value });
        startTimeNs = Math.min(startTimeNs, currentTimeNs);
      }
    }
  }

  const signals: WaveformSignal[] = [];
  for (const [id, meta] of varsById.entries()) {
    signals.push({
      name: meta.name,
      fullName: meta.fullName,
      width: meta.width,
      type: meta.type,
      wave: valuesById.get(id) ?? [],
    });
  }

  return {
    timescale,
    signals,
    startTimeNs: Number.isFinite(startTimeNs) ? startTimeNs : 0,
    endTimeNs,
  };
}
