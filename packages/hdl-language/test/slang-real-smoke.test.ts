import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SlangCliAdapter } from '../src/slang-cli.js';

const realSlangEnabled = process.env.NAYVID_REAL_SLANG === '1';

describe('real slang elaboration smoke', () => {
  it.skipIf(!realSlangEnabled)('elaborates real SystemVerilog and converts the serialized AST to DesignGraph', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nayvid-slang-real-'));
    fs.mkdirSync(path.join(root, 'rtl'));
    fs.writeFileSync(path.join(root, 'rtl', 'child.sv'), `module child(input logic a, output logic y); assign y = a; endmodule\n`);
    fs.writeFileSync(path.join(root, 'rtl', 'top.sv'), `
module top(
  input logic clk,
  input logic [7:0] data_i,
  output logic [7:0] data_o
);
  logic child_y;
  child u_child(.a(data_i[0]), .y(child_y));
  always_ff @(posedge clk) data_o <= {7'b0, child_y};
endmodule
`);

    const result = await new SlangCliAdapter().elaborate({
      workspaceRoot: root,
      files: ['rtl/child.sv', 'rtl/top.sv'],
      topModule: 'top',
      runtime: 'linux',
    });

    expect(result.runtimeUsed).toBe('linux');
    expect(fs.statSync(result.astPath).size).toBeGreaterThan(0);
    expect(result.graph.topModule).toBe('top');
    expect(result.graph.modules.top).toBeDefined();
    expect(result.graph.modules.top.ports.some((port) => port.name === 'data_i')).toBe(true);
    expect(result.graph.modules.top.instances.some((instance) => instance.name === 'u_child')).toBe(true);
    expect(result.graph.modules.child).toBeDefined();
  });
});
