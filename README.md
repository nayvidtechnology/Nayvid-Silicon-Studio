# Nayvid Silicon Studio

<p align="center">
  <img src="docs/asset/demo.png" alt="Nayvid Silicon Studio Demo UI" width="900" />
</p>

<p align="center">
  <strong>Open-source AI-native IDE for RTL, verification, FPGA/ASIC design, and silicon implementation</strong>
</p>

<p align="center">
  <strong>Design. Verify. Visualize. Build Silicon.</strong>
</p>

---

## Overview

**Nayvid Silicon Studio** is a local-first visual and agentic silicon engineering workbench. It combines a desktop IDE, structured RTL design intelligence, deterministic EDA execution, waveform analysis, verification utilities, and privacy-aware AI model routing.

The product is designed for:

- **Windows native** where a tool has a supported Windows build
- **Windows + WSL2** for Linux-first EDA flows
- **Linux native**
- **Docker** as an additional execution backend

The Studio does not report a tool operation as successful unless the underlying operation succeeds. Missing tools, missing files, failed simulations, and unavailable waveforms are surfaced as failures instead of being replaced with demo data.

## Key Capabilities

- **VeriVisual** — block-diagram models, VCD parsing, hierarchical waveform metadata, and signal intelligence.
- **NAVI** — specialist AI workflows with workspace context, privacy policy enforcement, tool approval guardrails, and execution timeline.
- **Design Graph IR** — modules, ports, signals, driver expressions, dependencies, instances, FSMs, source locations, clock domains, and reset domains.
- **Verification Cockpit** — regression/assertion summaries, coverage scoring, and uncovered-area identification.
- **Design Health** — weighted compile/lint/simulation/assertion/coverage/CDC/constraint/timing health assessment.
- **Traceability Matrix** — requirement → RTL → test → assertion coverage and gap analysis.
- **Register Map Generator** — validation plus SystemVerilog package, C header, Rust constants, and Markdown generation.
- **Formal Assistant** — reusable SVA helpers such as FIFO underflow/overflow and bounded request/response properties.
- **PPA Explorer** — area/power/performance/timing comparison and candidate ranking.
- **Verification Plan Generator** — DesignGraph-derived verification objectives.
- **Nayvid Doctor** — real tool detection through compatible Native Windows, WSL2, Linux, or Docker runtimes.

## Architecture & Packages

| Subsystem | Package | Purpose |
|---|---|---|
| VeriVisual | `@nayvid/verivisual` | Block diagrams, VCD/waveform parsing, signal intelligence |
| NAVI AI Core | `@nayvid/ai-core` | Context engine, privacy-aware routing, agent timeline |
| Model Providers | `@nayvid/model-providers` | OpenAI, Anthropic, Gemini, and Ollama API adapters |
| Design Graph IR | `@nayvid/design-ir` | Shared structured representation for silicon design intelligence |
| HDL Language | `@nayvid/hdl-language` | SystemVerilog source extraction and structural lint support |
| Flow Runtime | `@nayvid/execution-runtime` | Native Windows / WSL2 / Linux / Docker execution abstraction |
| Tool Registry & Doctor | `@nayvid/tool-registry` | Runtime-aware EDA capability registry and diagnostics |
| Agent Tool Gateway | `@nayvid/agent-tools` | Workspace-confined EDA/file tools and approval gates |
| Engineering Core | `@nayvid/engineering-core` | Verification, health, traceability, registers, PPA, formal helpers |
| Desktop Electron | `apps/desktop-electron` | Secure desktop process and IPC bridge |
| Studio Workbench | `apps/renderer` | Interactive Silicon Studio application logic and UI |

## Registered Open-Source Toolchain

Nayvid Doctor knows about the following tool families and selects only compatible runtimes:

- Language: **slang**, **Verible**
- Simulation/verification: **Icarus Verilog**, **Verilator**, **GHDL**, **cocotb**, **Surfer**
- Synthesis/FPGA: **Yosys**, **nextpnr**
- Formal: **SymbiYosys**
- Physical/timing: **OpenROAD**, **OpenSTA**, **KLayout**
- Local AI: **Ollama**

The EDA tools are optional external dependencies; the repository test suite uses deterministic fake backends for tool-contract tests and a separate real Icarus smoke test in CI.

## Quick Start

```bash
pnpm install
pnpm build
pnpm test
```

Run the complete repository check:

```bash
pnpm check
```

Launch the desktop application:

```bash
pnpm desktop
```

Run the terminal demonstration pipeline (requires the tools used by that flow, including Icarus for simulation):

```bash
pnpm start
```

Live model calls are opt-in for the CLI demo:

```bash
NAYVID_CLI_AI=1 pnpm start
```

## AI Providers and Privacy

Supported provider adapters:

- OpenAI — `OPENAI_API_KEY`
- Anthropic — `ANTHROPIC_API_KEY`
- Google Gemini — `GEMINI_API_KEY`
- Ollama — local endpoint, default `http://localhost:11434`

Workspace policies:

- `local-only`
- `ask-before-cloud`
- `cloud-allowed`
- `ai-disabled`

`ask-before-cloud` does not silently send RTL to a cloud provider. It uses a local provider when available or requires explicit cloud approval for the request.

## Real Counter Verification Demo

The repository contains a real SystemVerilog counter testbench:

```text
examples/counter/rtl/counter.sv
examples/counter/tb/counter_tb.sv
```

The CI smoke flow compiles it using Icarus Verilog, executes it with `vvp`, checks the PASS result, and verifies that a non-empty `sim.vcd` was generated.

## Testing Strategy

CI runs on **Ubuntu and Windows** using Node.js 22 and includes:

1. TypeScript builds for all workspace packages/apps.
2. Unit tests for pure domain logic.
3. Runtime-contract tests using injected execution backends.
4. Agent gateway safety and real-command invocation tests.
5. Provider HTTP contract/error tests without live cloud credentials.
6. Desktop IPC/workspace-confinement tests.
7. Renderer/cockpit integration tests with deterministic provider/tool injection.
8. A real Ubuntu Icarus → `vvp` → VCD smoke test.

## Desktop Distribution

The Electron package can be built through:

```bash
pnpm dist
```

Packaging support will continue to evolve independently from EDA runtime support; on Windows, Linux-first tools can still execute through WSL2 or Docker when their registry policy requires it.

## Documentation

See [docs/tutorial.md](docs/tutorial.md) for the current tutorial.

## License

This project is licensed under the [MIT License](LICENSE).
