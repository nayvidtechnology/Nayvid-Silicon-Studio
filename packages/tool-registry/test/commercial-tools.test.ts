import { describe, expect, it } from 'vitest';
import { COMMERCIAL_EDA_PROFILES, ToolRegistry, createProjectToolRegistry } from '../src/index.js';

describe('commercial EDA profile catalog', () => {
  it('keeps commercial tools opt-in for the default Doctor registry', () => {
    const defaults = new ToolRegistry();
    expect(defaults.getTool('synopsys-vcs')).toBeUndefined();
    expect(COMMERCIAL_EDA_PROFILES.some((tool) => tool.id === 'synopsys-vcs')).toBe(true);
    expect(COMMERCIAL_EDA_PROFILES.some((tool) => tool.id === 'cadence-xcelium')).toBe(true);
    expect(COMMERCIAL_EDA_PROFILES.some((tool) => tool.id === 'siemens-calibre')).toBe(true);
  });

  it('builds a strict registry containing only project-declared tools', () => {
    const registry = createProjectToolRegistry(['slang', 'synopsys-vcs', 'synopsys-primetime']);
    expect(registry.getTool('slang')).toBeDefined();
    expect(registry.getTool('synopsys-vcs')?.commercial).toBe(true);
    expect(registry.getTool('synopsys-primetime')?.capabilities).toContain('sta');
    expect(registry.getTool('yosys')).toBeUndefined();
    expect(registry.getTool('cadence-innovus')).toBeUndefined();
  });
});
