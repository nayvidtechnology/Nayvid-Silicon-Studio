export interface SubsystemIcon {
  id: string;
  name: string;
  symbol: string;
  svg: string;
}

export const SubsystemIcons: Record<string, SubsystemIcon> = {
  SiliconStudio: {
    id: 'silicon-studio',
    name: 'Silicon Studio',
    symbol: '◈',
    svg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
      <circle cx="16" cy="8" r="1.5" fill="currentColor" />
      <circle cx="8" cy="16" r="1.5" fill="currentColor" />
      <circle cx="16" cy="16" r="1.5" fill="currentColor" />
      <path d="M8 8 L12 12 L16 8" />
      <path d="M8 16 L12 12 L16 16" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
    </svg>`,
  },
  VeriVisual: {
    id: 'verivisual',
    name: 'VeriVisual',
    symbol: '⌁',
    svg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 12 h4 l3 -8 l4 16 l3 -8 h4" />
    </svg>`,
  },
  NAVI: {
    id: 'navi',
    name: 'NAVI AI',
    symbol: '✦',
    svg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z" />
    </svg>`,
  },
  DesignGraph: {
    id: 'design-graph',
    name: 'Design Graph',
    symbol: '⎇',
    svg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="12" cy="18" r="3" />
      <path d="M6 9 v3 a3 3 0 0 0 3 3 h3" />
      <path d="M18 9 v3 a3 3 0 0 1 -3 3 h-3" />
    </svg>`,
  },
  SiliconFlow: {
    id: 'silicon-flow',
    name: 'Silicon Flow',
    symbol: '⌘',
    svg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 0v12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 0v12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    </svg>`,
  },
  Simulation: {
    id: 'simulation',
    name: 'Simulation',
    symbol: '▶',
    svg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>`,
  },
  Schematic: {
    id: 'schematic',
    name: 'Schematic',
    symbol: '◫',
    svg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="8.5" y="14" width="7" height="7" />
      <path d="M10 6.5 h4 M12 6.5 v7" />
    </svg>`,
  },
  Waveform: {
    id: 'waveform',
    name: 'Waveform',
    symbol: '≋',
    svg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M2 6 h4 v6 h6 v-6 h6 v6 h4" />
      <path d="M2 18 h20" stroke-dasharray="2 2" />
    </svg>`,
  },
  FSM: {
    id: 'fsm',
    name: 'FSM',
    symbol: '⑂',
    svg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="12" r="3" />
      <path d="M9 10 c3 -4 6 -4 6 0 M9 14 c3 4 6 4 6 0" />
    </svg>`,
  },
  Verification: {
    id: 'verification',
    name: 'Verification',
    symbol: '✓',
    svg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M20 6 L9 17 L4 12" />
    </svg>`,
  },
  Formal: {
    id: 'formal',
    name: 'Formal',
    symbol: '⊢',
    svg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <line x1="5" y1="4" x2="5" y2="20" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>`,
  },
  Synthesis: {
    id: 'synthesis',
    name: 'Synthesis',
    symbol: '⚙',
    svg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>`,
  },
  Doctor: {
    id: 'doctor',
    name: 'Doctor',
    symbol: '🩺',
    svg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 0 0 .2.3" />
      <path d="M8 15v1a6 6 0 0 0 6 6h2a2 2 0 0 0 2-2v-3" />
      <circle cx="18" cy="14" r="2" />
    </svg>`,
  },
  Privacy: {
    id: 'privacy',
    name: 'Privacy',
    symbol: '⛨',
    svg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <circle cx="12" cy="11" r="2" />
      <path d="M12 13v3" />
    </svg>`,
  },
};
