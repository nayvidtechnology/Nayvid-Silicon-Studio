# Nayvid Silicon Studio

<p align="center">
  <img src="docs/asset/demo.png" alt="Nayvid Silicon Studio Demo UI" width="900" style="border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);" />
</p>

<p align="center">
  <strong>Open-source AI-native IDE for RTL, verification, FPGA/ASIC design, and RTL-to-GDS</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#architecture--subsystems">Architecture</a> •
  <a href="docs/tutorial.md">Full Tutorial</a> •
  <a href="#desktop-gui-and-release">Releases</a> •
  <a href="#license">License</a>
</p>

---

## Overview

**Nayvid Silicon Studio** is a next-generation visual and agentic silicon engineering workbench. It unifies open-source EDA toolchains (Slang, Verilator, Yosys, OpenROAD, Cocotb, Surfer) into a cohesive desktop development environment powered by specialized AI agents and visual debuggers.

### Key Capabilities

* 📐 **Visual RTL & Schematic Studio**: Interactive VeriVisual block diagrams, schematics, and FSM transition graphs generated from SystemVerilog.
* 📊 **Waveform Viewer**: Cycle-accurate digital timing diagram viewer with multi-channel bus transitions and signal tracing.
* 🤖 **NAVI AI Copilot**: Agentic AI assistant with specialist skills (`waveform-debugger`, `rtl-engineer`, `verification-engineer`, `pnr-specialist`) and multi-turn execution tracking.
* 🔍 **Signal Intelligence**: Automated driver/load dependency extraction and root-cause failure analysis.
* 🩺 **Nayvid Doctor**: Real-time environment diagnostics for local EDA toolchains across Native Windows, WSL2, Linux, and Docker backends.

---

## Architecture & Subsystems

| Subsystem | Package | Description |
| :--- | :--- | :--- |
| **VeriVisual** | `@nayvid/verivisual` | Visual schematic, block diagram, waveform parser, and signal intelligence engine |
| **NAVI Agent** | `@nayvid/ai-core` | Multi-specialist AI agent, context engine, and timeline tracker |
| **Model Fabric Router** | `@nayvid/model-providers` | Privacy-aware provider routing (Ollama local, OpenAI, Gemini) |
| **Design Graph IR** | `@nayvid/design-ir` | Unified AST & graph IR for modules, ports, registers, clock/reset domains, and FSMs |
| **Flow Runtime** | `@nayvid/execution-runtime` | Multi-backend execution engine (Native Windows, WSL2, Docker) |
| **Tool Registry & Doctor** | `@nayvid/tool-registry` | EDA compiler/simulator registry and self-healing diagnostic engine |
| **Agent Tools Gateway** | `@nayvid/agent-tools` | Safe tool invocation gateway with approval guardrails |
| **Desktop Electron** | `apps/desktop-electron` | Native cross-platform desktop application shell |
| **Studio Workbench** | `apps/renderer` | Modern dark-mode multi-tab IDE interface |

---

## Quick Start

### Step 1: Install Dependencies
```bash
# Install pnpm workspace dependencies
pnpm install
```

### Step 2: Build Workspace Packages
```bash
# Compile TypeScript across all 11 packages and apps
pnpm build
```

### Step 3: Run the Verification Test Suite
```bash
# Execute unit and integration tests
pnpm test
```

### Step 4: Launch the Native Desktop GUI IDE
```bash
# Open the Native Electron Desktop Studio Window
pnpm run desktop
```

### Step 5: Run Studio Engine CLI Pipeline (Optional)
```bash
# Run the end-to-end studio pipeline in terminal
pnpm start
```

---

## Desktop GUI and Release

### Standalone Distribution Packaging
To build a standalone Windows executable (`.exe`):

```bash
pnpm run dist
```

The output standalone binary is packaged into:
```text
apps/desktop-electron/release/win-unpacked/Nayvid Silicon Studio.exe
```

---

## User Guide & Tutorials

For a complete step-by-step walkthrough covering:
- Creating custom projects with `nayvid.project.yaml`
- Writing and syntax-checking SystemVerilog RTL
- Inspecting VeriVisual block diagrams & waveforms
- Debugging with NAVI AI Copilot and Signal Intelligence
- Running Nayvid Doctor diagnostics

👉 **Read the [Complete User Tutorial (docs/tutorial.md)](docs/tutorial.md)**.

---

## License

This project is licensed under the [MIT License](LICENSE).
