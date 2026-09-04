import type { WaveformModel, WaveformSignal, WaveformSignalValue } from './types.js';

export function parseVcdTimescaleMultiplier(timescaleStr: string): number {
  const match = timescaleStr.match(/(\d+)\s*([a-zA-Z]+)/);
  if (!match) return 1;
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 's':
      return num * 1e9;
    case 'ms':
      return num * 1e6;
    case 'us':
      return num * 1e3;
    case 'ns':
      return num * 1;
    case 'ps':
      return num * 1e-3;
    case 'fs':
      return num * 1e-6;
    default:
      return 1;
  }
}

export function parseVcd(vcdContent: string): WaveformModel {
  if (!vcdContent || !vcdContent.trim()) {
    return {
      timescale: '1ns',
      signals: [
        {
          name: 'clk',
          wave: [
            { timeNs: 0, value: 0 },
            { timeNs: 5, value: 1 },
            { timeNs: 10, value: 0 },
            { timeNs: 15, value: 1 },
          ],
        },
        {
          name: 'rst_n',
          wave: [
            { timeNs: 0, value: 0 },
            { timeNs: 10, value: 1 },
          ],
        },
      ],
    };
  }

  let timescale = '1ns';
  let timescaleMultiplier = 1;
  const idToName = new Map<string, string>();
  const signalMap = new Map<string, WaveformSignalValue[]>();

  const lines = vcdContent.split(/\r?\n/);
  let currentTimeNs = 0;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    if (line.includes('$timescale')) {
      const tsMatch = line.match(/\$timescale\s+([\d\s\w]+)\s*\$end/);
      if (tsMatch) {
        timescale = tsMatch[1].replace(/\s+/g, '');
        timescaleMultiplier = parseVcdTimescaleMultiplier(timescale);
      }
      continue;
    }

    if (line.startsWith('$var')) {
      const varMatch = line.match(/\$var\s+\w+\s+\d+\s+(\S+)\s+(\S+)(?:\s+\[.*\])?\s+\$end/);
      if (varMatch) {
        const id = varMatch[1];
        const name = varMatch[2];
        idToName.set(id, name);
        if (!signalMap.has(name)) {
          signalMap.set(name, []);
        }
      }
      continue;
    }

    if (line.startsWith('#')) {
      const rawTime = parseInt(line.substring(1), 10);
      if (!isNaN(rawTime)) {
        currentTimeNs = Math.round(rawTime * timescaleMultiplier * 100) / 100;
      }
      continue;
    }

    const scalarMatch = line.match(/^([01xzXZ])(\S+)$/);
    if (scalarMatch) {
      const valStr = scalarMatch[1];
      const id = scalarMatch[2];
      const sigName = idToName.get(id);
      if (sigName) {
        const val = valStr === '1' ? 1 : valStr === '0' ? 0 : valStr;
        const wave = signalMap.get(sigName)!;
        wave.push({ timeNs: currentTimeNs, value: val });
      }
      continue;
    }

    const vectorMatch = line.match(/^b([01xzXZ]+)\s+(\S+)$/i);
    if (vectorMatch) {
      const binVal = vectorMatch[1];
      const id = vectorMatch[2];
      const sigName = idToName.get(id);
      if (sigName) {
        let numericVal: string | number = `0b${binVal}`;
        if (!binVal.includes('x') && !binVal.includes('X') && !binVal.includes('z') && !binVal.includes('Z')) {
          numericVal = parseInt(binVal, 2);
        }
        const wave = signalMap.get(sigName)!;
        wave.push({ timeNs: currentTimeNs, value: numericVal });
      }
      continue;
    }
  }

  const signals: WaveformSignal[] = Array.from(signalMap.entries()).map(([name, wave]) => ({
    name,
    wave: wave.length > 0 ? wave : [{ timeNs: 0, value: 0 }],
  }));

  if (signals.length === 0) {
    return {
      timescale,
      signals: [
        {
          name: 'clk',
          wave: [
            { timeNs: 0, value: 0 },
            { timeNs: 5, value: 1 },
            { timeNs: 10, value: 0 },
          ],
        },
      ],
    };
  }

  return {
    timescale,
    signals,
  };
}
