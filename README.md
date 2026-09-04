# Nayvid Silicon Studio

**Open-source AI-native IDE for RTL, verification, FPGA/ASIC design, and RTL-to-GDS**

Nayvid Silicon Studio is a visual and agentic engineering environment built on open-source EDA toolchains.

## Architecture & Subsystems

* **VeriVisual**: Visual RTL/schematic/waveform/debug engine
* **NAVI Agent**: AI-native coding and verification agent
* **Nayvid Flow Runtime**: Multi-backend tool execution abstraction (Native Windows, WSL2, Linux, Docker)
* **Nayvid Design Graph IR**: Unified intermediate representation for SV modules, hierarchy, signals, registers, FSMs, and clock/reset domains
* **Nayvid Doctor**: Comprehensive environment diagnostic and self-healing engine

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages and applications
pnpm build

# Run unit and integration tests
pnpm test
```

## License

[MIT](LICENSE)
