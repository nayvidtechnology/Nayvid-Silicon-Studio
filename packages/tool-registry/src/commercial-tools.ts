import type { ToolDefinition } from './types.js';
import { BUILTIN_TOOLS, ToolRegistry } from './tools.js';

const qualifiedLinux = {
  'native-windows': 'unsupported',
  wsl2: 'limited',
  linux: 'preferred',
  docker: 'limited',
  auto: 'preferred',
} as const;

/**
 * Optional commercial EDA profiles. They are deliberately not part of the
 * default Doctor scan because availability, qualified OS versions and license
 * configuration are customer-specific. Enterprise projects opt in explicitly.
 */
export const COMMERCIAL_EDA_PROFILES: ToolDefinition[] = [
  {
    id: 'synopsys-vcs', name: 'Synopsys VCS', vendor: 'Synopsys', commercial: true,
    category: 'simulation', binaryName: 'vcs', probeArgs: ['-ID'], supportedRuntimes: qualifiedLinux,
    capabilities: ['systemverilog', 'simulation', 'coverage', 'waveform'],
    installGuide: 'Use the customer-managed Synopsys installation and license environment on a qualified Linux runner.',
  },
  {
    id: 'cadence-xcelium', name: 'Cadence Xcelium', vendor: 'Cadence', commercial: true,
    category: 'simulation', binaryName: 'xrun', probeArgs: ['-version'], supportedRuntimes: qualifiedLinux,
    capabilities: ['systemverilog', 'vhdl', 'simulation', 'coverage', 'waveform'],
    installGuide: 'Use the customer-managed Cadence installation and license environment on a qualified Linux runner.',
  },
  {
    id: 'siemens-questa', name: 'Siemens Questa', vendor: 'Siemens EDA', commercial: true,
    category: 'simulation', binaryName: 'vsim', probeArgs: ['-version'], supportedRuntimes: qualifiedLinux,
    capabilities: ['systemverilog', 'vhdl', 'simulation', 'coverage', 'waveform'],
    installGuide: 'Use the customer-managed Siemens EDA installation and license environment on a qualified Linux runner.',
  },
  {
    id: 'synopsys-design-compiler', name: 'Synopsys Design Compiler', vendor: 'Synopsys', commercial: true,
    category: 'synthesis', binaryName: 'dc_shell', probeArgs: ['-version'], supportedRuntimes: qualifiedLinux,
    capabilities: ['systemverilog', 'synthesis'],
    installGuide: 'Use the customer-managed Design Compiler installation and license environment.',
  },
  {
    id: 'cadence-genus', name: 'Cadence Genus', vendor: 'Cadence', commercial: true,
    category: 'synthesis', binaryName: 'genus', probeArgs: ['-version'], supportedRuntimes: qualifiedLinux,
    capabilities: ['systemverilog', 'synthesis'],
    installGuide: 'Use the customer-managed Genus installation and license environment.',
  },
  {
    id: 'synopsys-primetime', name: 'Synopsys PrimeTime', vendor: 'Synopsys', commercial: true,
    category: 'timing', binaryName: 'pt_shell', probeArgs: ['-version'], supportedRuntimes: qualifiedLinux,
    capabilities: ['sta', 'power'],
    installGuide: 'Use the customer-managed PrimeTime installation and license environment.',
  },
  {
    id: 'cadence-tempus', name: 'Cadence Tempus', vendor: 'Cadence', commercial: true,
    category: 'timing', binaryName: 'tempus', probeArgs: ['-version'], supportedRuntimes: qualifiedLinux,
    capabilities: ['sta', 'power'],
    installGuide: 'Use the customer-managed Tempus installation and license environment.',
  },
  {
    id: 'cadence-innovus', name: 'Cadence Innovus', vendor: 'Cadence', commercial: true,
    category: 'physical', binaryName: 'innovus', probeArgs: ['-version'], supportedRuntimes: qualifiedLinux,
    capabilities: ['place-route', 'sta', 'power'],
    installGuide: 'Use the customer-managed Innovus installation and license environment.',
  },
  {
    id: 'siemens-calibre', name: 'Siemens Calibre', vendor: 'Siemens EDA', commercial: true,
    category: 'signoff', binaryName: 'calibre', probeArgs: ['-version'], supportedRuntimes: qualifiedLinux,
    capabilities: ['drc', 'lvs'],
    installGuide: 'Use the customer-managed Calibre installation, foundry rule decks and license environment.',
  },
];

export function createEnterpriseToolRegistry(enabledProfileIds?: string[]): ToolRegistry {
  const enabled = enabledProfileIds?.length
    ? COMMERCIAL_EDA_PROFILES.filter((profile) => enabledProfileIds.includes(profile.id))
    : COMMERCIAL_EDA_PROFILES;
  return new ToolRegistry([...BUILTIN_TOOLS, ...enabled]);
}
