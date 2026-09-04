import { describe, it, expect } from 'vitest';
import { SiliconStudioApp } from '../src/app.js';

describe('Silicon Studio App Renderer Logic', () => {
  it('switches tabs, builds design diagrams, and constructs context', async () => {
    const app = new SiliconStudioApp();
    expect(app.getActiveTab()).toBe('rtl');

    app.setActiveTab('block-diagram');
    expect(app.getActiveTab()).toBe('block-diagram');

    const diagram = await app.getBlockDiagram();
    expect(diagram.nodes.length).toBeGreaterThan(0);

    const wave = app.getWaveform();
    expect(wave.signals.length).toBeGreaterThan(0);

    const prompt = app.getPromptContext();
    expect(prompt).toContain('counter.sv');
  });
});
