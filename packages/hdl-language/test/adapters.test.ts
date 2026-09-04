import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SlangAdapter, VeribleAdapter } from '../src/index.js';

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function writeFixture(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nayvid-hdl-'));
  tempDirs.push(dir);
  const file = path.join(dir, 'counter.sv');
  fs.writeFileSync(file, content, 'utf-8');
  return file;
}

describe('HDL Language Adapters', () => {
  it('slang adapter generates DesignGraph IR from an actual SV file', async () => {
    const file = writeFixture(`
      module counter(input logic clk, input logic rst_n, output logic count);
        always_ff @(posedge clk or negedge rst_n) begin
          if (!rst_n) count <= 1'b0;
          else count <= ~count;
        end
      endmodule
    `);
    const graph = await new SlangAdapter().parseToIR([file], 'counter');
    expect(graph.topModule).toBe('counter');
    expect(graph.modules.counter).toBeDefined();
    expect(graph.modules.counter.signals.find((s) => s.name === 'count')?.drivers.length).toBeGreaterThan(0);
  });

  it('verible adapter provides deterministic structural lint results without fake diagnostics', async () => {
    const file = writeFixture('module counter(input logic clk, output logic q); always @(*) q = clk; endmodule\n');
    const lints = await new VeribleAdapter().runLint([file]);
    expect(lints).toHaveLength(1);
    expect(lints[0].diagnostics.some((d) => d.code === 'systemverilog-style')).toBe(true);
    expect(lints[0].diagnostics.some((d) => d.code === 'no-reset-domain')).toBe(true);
  });
});
