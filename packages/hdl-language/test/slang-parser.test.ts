import { describe, expect, it } from 'vitest';
import { SlangAdapter, parseSystemVerilogContent } from '../src/index.js';

describe('SlangAdapter SystemVerilog Parsing', () => {
  const svContent = `
    module uart_controller (
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

      assign busy = (state != IDLE);
    endmodule
  `;

  it('parses real module structure and source-derived FSM transitions', () => {
    const modules = parseSystemVerilogContent(svContent, 'rtl/uart_controller.sv');
    expect(modules).toHaveLength(1);
    const mod = modules[0];
    expect(mod.name).toBe('uart_controller');
    expect(mod.ports).toHaveLength(5);
    expect(mod.clockDomains).toContain('clk');
    expect(mod.resetDomains).toContain('rst_n');
    expect(mod.fsms).toHaveLength(1);
    expect(mod.fsms[0].states.map((s) => s.name)).toEqual(['IDLE', 'START', 'DATA', 'STOP']);
    expect(mod.fsms[0].transitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'IDLE', to: 'START', condition: '!rx' }),
      expect.objectContaining({ from: 'START', to: 'DATA' }),
      expect.objectContaining({ from: 'DATA', to: 'STOP' }),
      expect.objectContaining({ from: 'STOP', to: 'IDLE' }),
    ]));
    expect(mod.fsms[0].transitions.every((t) => t.condition !== 'req == 1')).toBe(true);
  });

  it('captures real driver expressions and signal dependencies', () => {
    const mod = parseSystemVerilogContent(svContent, 'rtl/uart_controller.sv')[0];
    const busy = mod.signals.find((s) => s.name === 'busy');
    expect(busy?.driverExpressions?.[0].expression).toContain('state != IDLE');
    expect(busy?.dependsOn).toContain('state');
    expect(busy?.drivers[0].file).toBe('rtl/uart_controller.sv');
    expect(mod.signals.find((s) => s.name === 'state')?.loads.length).toBeGreaterThan(0);
  });

  it('preserves virtual source names with parseContentToIR', async () => {
    const graph = await new SlangAdapter().parseContentToIR(svContent, 'virtual/uart_controller.sv', 'uart_controller');
    expect(graph.modules.uart_controller.file).toBe('virtual/uart_controller.sv');
    expect(graph.modules.uart_controller.ports[0].location?.file).toBe('virtual/uart_controller.sv');
  });

  it('rejects missing source files instead of fabricating an HDL design', async () => {
    await expect(new SlangAdapter().parseToIR(['rtl/definitely-missing.sv'], 'top')).rejects.toThrow(/source not found/);
  });
});
