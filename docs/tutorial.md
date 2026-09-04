# Nayvid Silicon Studio — Comprehensive User Tutorial

Welcome to **Nayvid Silicon Studio**, an open-source AI-native IDE designed specifically for digital IC designers, verification engineers, and FPGA/ASIC developers.

This tutorial walks you through everything from project setup to visual debugging and AI-assisted verification.

---

## Table of Contents

1. [Installation & Requirements](#1-installation--requirements)
2. [Launching the Studio IDE](#2-launching-the-studio-ide)
3. [Creating & Configuring a Project](#3-creating--configuring-a-project)
4. [Writing RTL with Syntax & Design Graph IR](#4-writing-rtl-with-syntax--design-graph-ir)
5. [VeriVisual: Interactive Schematics & Block Diagrams](#5-verivisual-interactive-schematics--block-diagrams)
6. [Simulating & Waveform Debugging](#6-simulating--waveform-debugging)
7. [Signal Intelligence & Root-Cause Analysis](#7-signal-intelligence--root-cause-analysis)
8. [NAVI AI Copilot Workflows](#8-navi-ai-copilot-workflows)
9. [Nayvid Doctor Diagnostics](#9-nayvid-doctor-diagnostics)
10. [Packaging Releases](#10-packaging-releases)

---

## 1. Installation & Requirements

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **pnpm**: v9 or v10/v11 (`npm install -g pnpm`)
- **Git**

### Clone and Install
```bash
git clone https://github.com/nayvidtechnology/Nayvid-Silicon-Studio.git
cd Nayvid-Silicon-Studio

# Install workspace dependencies
pnpm install

# Build all 11 workspace packages
pnpm build
```

---

## 2. Launching the Studio IDE

### Launch Native Desktop Application (Electron)
```bash
pnpm run desktop
```

### Run Studio CLI Pipeline Demo
```bash
pnpm start
```

### Run Full Test Suites
```bash
pnpm test
```

---

## 3. Creating & Configuring a Project

Every Nayvid project contains a `nayvid.project.yaml` file in the root directory.

### Example Project Structure
```text
my-silicon-project/
├── nayvid.project.yaml      # Project configuration
├── rtl/
│   ├── counter.sv           # SystemVerilog RTL sources
│   └── alu.sv
├── tb/
│   └── tb_counter.cpp       # Verilator/Cocotb testbench
└── syn/
    └── config.tcl           # OpenROAD / Yosys synthesis scripts
```

### `nayvid.project.yaml` Configuration Reference
```yaml
# nayvid.project.yaml
project:
  name: counter-demo
  top: counter               # Top-level module name

sources:
  - rtl/counter.sv           # RTL file paths or glob patterns

tests:
  - name: tb_counter
    type: verilator          # Simulator: verilator | icarus | cocotb
    path: tb/tb_counter.cpp

simulation:
  engine: verilator
  timescale: 1ns/1ps

synthesis:
  engine: yosys              # Synthesis engine: yosys | openroad
  target_pdk: sky130

ai:
  policy: ask-before-cloud   # Privacy: local-only | ask-before-cloud | cloud-allowed
```

---

## 4. Writing RTL with Syntax & Design Graph IR

1. Open the **RTL Editor** tab (`</> RTL Editor`).
2. Write or paste your SystemVerilog module:

```systemverilog
module counter (
  input  logic       clk,
  input  logic       rst_n,
  input  logic       enable,
  output logic [1:0] count,
  output logic       done
);

  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      count <= 2'b00;
      done  <= 1'b0;
    end else if (enable) begin
      if (count == 2'b11) begin
        count <= 2'b00;
        done  <= 1'b1;
      end else begin
        count <= count + 1'b1;
        done  <= 1'b0;
      end
    end
  end

endmodule
```

3. Click **⚡ Re-Parse Design Graph IR** to extract:
   - Module hierarchy and port interfaces
   - Sequential registers and clock/reset domains
   - Finite State Machines (FSMs)

---

## 5. VeriVisual: Interactive Schematics & Block Diagrams

Click the **☵ VeriVisual Schematic** tab to view the live generated hardware diagram:
- **Module boundaries**: Displays the top module `counter`.
- **Port Interfaces**: Inputs (`clk`, `rst_n`, `enable`) on the left (Cyan); outputs (`count [1:0]`, `done`) on the right (Amber/Green).
- **Sequential Registers**: Register and logic blocks inside the module.
- **Interactive Inspection**: Click any signal wire to open its Signal Intelligence card in the right drawer.

---

## 6. Simulating & Waveform Debugging

1. Click **▶ Run Sim (tb_counter)** from the top bar or switch to the **📊 Waveform Viewer** tab.
2. The waveform viewer renders multi-channel digital timing diagrams:
   - `clk`: 100MHz clock square wave
   - `rst_n`: Active-low asynchronous reset pulse
   - `enable`: Counter enable pulse
   - `count [1:0]`: Multi-bit bus values (`2'h0` → `2'h1` → `2'h2` → `2'h3`)
   - `done`: Single-cycle terminal count indicator
3. Click along the timeline (0ns to 80ns) to inspect exact signal levels at any point in time.

---

## 7. Signal Intelligence & Root-Cause Analysis

When an unexpected value occurs on a wire:
1. Select the signal from the **Design Navigator** or click the wire in **VeriVisual**.
2. The **Signal Intelligence Engine** automatically detects:
   - **Declared Location**: File and line number definition.
   - **Drivers**: Exact RTL lines driving the register/wire.
   - **Loads**: Fan-out registers and conditional branches reading the wire.
   - **Suspected Root Cause**: Explanation of why the signal remained low or did not transition.

---

## 8. NAVI AI Copilot Workflows

The right drawer hosts **NAVI**, your multi-specialist AI silicon engineering assistant.

### Selecting Specialist Skills
Choose the required skill from the dropdown:
- **`waveform-debugger`**: Analyzes VCD traces, missing clock edges, and timing glitches.
- **`rtl-engineer`**: Writes SystemVerilog modules, parameterized generators, and clean FSMs.
- **`verification-engineer`**: Generates SVA assertions, UVM sequences, and Cocotb testbenches.
- **`pnr-specialist`**: Assists with Yosys synthesis scripts and OpenROAD floorplanning constraints.

### Example Prompts:
```text
"Why did done stay low when enable was high at 20ns?"
"Generate SystemVerilog Assertions (SVA) ensuring count wraps from 3 to 0."
"Synthesize this counter using Yosys and target sky130 PDK."
```

### Privacy Policies:
- **`🔒 Ask Before Cloud`**: Prompts for confirmation before sending sensitive RTL context to cloud LLMs.
- **`🏠 Local Models Only`**: Routes queries strictly to local Ollama / llama.cpp models.
- **`☁️ Cloud Allowed`**: Direct high-speed inference with OpenAI / Gemini providers.

---

## 9. Nayvid Doctor Diagnostics

Switch to the **🩺 Nayvid Doctor** tab to verify your system's EDA environment:
- Automatically scans **Slang**, **Verilator**, **Yosys**, **OpenROAD**, **Cocotb**, **Surfer**, **Icarus Verilog**, **NextPNR**, and **GHDL**.
- Identifies execution runtime (Native Windows, WSL2, Linux, Docker).
- Provides one-click re-scanning with **🔄 Re-scan All Tools**.

---

## 10. Packaging Releases

To package a standalone Windows desktop executable:

```bash
pnpm run dist
```

The output standalone binary is located at:
```text
apps/desktop-electron/release/win-unpacked/Nayvid Silicon Studio.exe
```
