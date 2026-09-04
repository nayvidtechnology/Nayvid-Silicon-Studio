import { describe, it, expect } from 'vitest';
import { SlangAdapter, parseSystemVerilogContent } from '../src/index.js';

describe('SlangAdapter SystemVerilog Parsing', () => {
  it('parses real SystemVerilog module, ports, signals, registers, and FSM', () => {
    const svContent = `
      module uart_controller #(
        parameter BAUD_RATE = 115200
      )(
        input logic clk,
        input logic rst_n,
        input logic rx,
        output logic tx,
        output logic busy
      );

        typedef enum logic [1:0] {
          IDLE = 2'b00,
          START = 2'b01,
          DATA = 2'b10,
          STOP = 2'b11
        } state_t;

        state_t state;
        logic [7:0] tx_shift;

        always_ff @(posedge clk or negedge rst_n) begin
          if (!rst_n) begin
            state <= IDLE;
            tx <= 1'b1;
          end else begin
            case (state)
              IDLE: if (!rx) state <= START;
              START: state <= DATA;
              DATA: state <= STOP;
              STOP: state <= IDLE;
            endcase
          end
        end

      endmodule
    `;

    const modules = parseSystemVerilogContent(svContent, 'rtl/uart_controller.sv');
    expect(modules.length).toBe(1);

    const mod = modules[0];
    expect(mod.name).toBe('uart_controller');
    expect(mod.ports.length).toBe(5);
    expect(mod.ports.find((p) => p.name === 'clk')?.direction).toBe('input');
    expect(mod.ports.find((p) => p.name === 'tx')?.direction).toBe('output');

    expect(mod.signals.some((s) => s.name === 'state')).toBe(true);
    expect(mod.signals.some((s) => s.name === 'tx_shift')).toBe(true);

    expect(mod.clockDomains).toContain('clk');
    expect(mod.resetDomains).toContain('rst_n');

    expect(mod.fsms.length).toBe(1);
    expect(mod.fsms[0].states.length).toBe(4);
    expect(mod.fsms[0].states.map((s) => s.name)).toEqual(['IDLE', 'START', 'DATA', 'STOP']);
  });

  it('runs lint diagnostics on SystemVerilog files', async () => {
    const adapter = new SlangAdapter();
    const lints = await adapter.runLint(['rtl/counter.sv']);
    expect(lints.length).toBe(1);
    expect(lints[0].file).toBe('rtl/counter.sv');
  });
});
