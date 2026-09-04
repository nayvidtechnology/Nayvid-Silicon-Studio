import { describe, it, expect } from 'vitest';
import { SlangAdapter, VeribleAdapter } from '../src/index.js';

describe('HDL Language Adapters', () => {
  it('slang adapter generates DesignGraph IR from SV files', async () => {
    const adapter = new SlangAdapter();
    const graph = await adapter.parseToIR(['rtl/counter.sv'], 'counter');
    expect(graph.topModule).toBe('counter');
    expect(graph.modules['counter']).toBeDefined();
    expect(graph.modules['counter'].fsms.length).toBeGreaterThan(0);
  });

  it('verible adapter produces lint diagnostics', async () => {
    const adapter = new VeribleAdapter();
    const lints = await adapter.runLint(['rtl/counter.sv']);
    expect(lints.length).toBe(1);
    expect(lints[0].diagnostics.length).toBe(1);
    expect(lints[0].diagnostics[0].severity).toBe('info');
  });
});
