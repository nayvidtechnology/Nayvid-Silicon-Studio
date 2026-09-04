export * from './app.js';
import { SiliconStudioApp } from './app.js';

export async function main() {
  console.log('='.repeat(70));
  console.log('  NAYVID SILICON STUDIO — AI-Native Silicon Engineering Workspace');
  console.log('  Design. Verify. Visualize. Build Silicon.');
  console.log('='.repeat(70));

  const app = new SiliconStudioApp();
  const identity = app.getIdentity();

  console.log(`\n[*] App: ${identity.appName}`);
  console.log(`[*] Tagline: ${identity.tagline}`);
  console.log(`[*] Subsystems: VeriVisual, NAVI Agent, Nayvid Doctor, Flow Runtime, Design Graph IR\n`);

  console.log('--- Step 1: Running Nayvid Doctor Diagnostics ---');
  const doctor = await app.runDoctorDiagnostics();
  console.log(`  Total Tool Checks: ${doctor.summary.total} (Installed/Passed: ${doctor.summary.passed}, Missing: ${doctor.summary.failed})`);

  console.log('\n--- Step 2: Opening SystemVerilog RTL Design (examples/counter/rtl/counter.sv) ---');
  const graph = await app.openFile('examples/counter/rtl/counter.sv');
  console.log(`  Top Module: ${graph.topModule}`);
  console.log(`  Modules Loaded: ${Object.keys(graph.modules).join(', ')}`);

  console.log('\n--- Step 3: Design Navigator & Hierarchy ---');
  const nav = await app.getDesignNavigator();
  const mod = nav.modules[graph.topModule];
  if (mod) {
    console.log(`  Inputs:        ${mod.inputs.join(', ') || 'None'}`);
    console.log(`  Outputs:       ${mod.outputs.join(', ') || 'None'}`);
    console.log(`  Registers:     ${mod.registers.join(', ') || 'None'}`);
    console.log(`  Clock Domains: ${mod.clockDomains.join(', ') || 'Default'}`);
    console.log(`  Reset Domains: ${mod.resetDomains.join(', ') || 'Default'}`);
  }

  console.log('\n--- Step 4: Generating VeriVisual Block Diagram ---');
  const diagram = await app.getBlockDiagram();
  console.log(`  Visual Nodes: ${diagram.nodes.map((n) => `${n.label} (${n.type})`).join(', ')}`);
  console.log(`  Visual Edges: ${diagram.edges.length} connections routed`);

  console.log('\n--- Step 5: Executing Verification Simulation ---');
  const wave = await app.runSimulation('tb_counter');
  console.log(`  Simulation Test: tb_counter`);
  console.log(`  Captured Signals: ${wave.signals.map((s) => s.name).join(', ')}`);

  console.log('\n--- Step 6: Signal Intelligence & Root-Cause Inspection ---');
  const sigContext = await app.inspectSignal('count', 10);
  console.log(`  Inspected Signal: ${sigContext.signalName}`);
  console.log(`  Drivers: ${sigContext.drivers.map((d) => `line ${d.line}`).join(', ') || 'None'}`);
  console.log(`  Waveform Value at t=10ns: ${sigContext.waveformValueAtTime ?? 'N/A'}`);
  console.log(`  Suspected Cause: ${sigContext.suspectedCause ?? 'Normal Operation'}`);

  console.log('\n--- Step 7: NAVI AI Agent Query ---');
  console.log(`  Asking NAVI (Skill: waveform-debugger): "Why is count incrementing as expected?"`);
  const naviResponse = await app.askNavi('Why is count incrementing as expected?', 'waveform-debugger');
  console.log(`  NAVI Response:\n  ${naviResponse.answer.replace(/\n/g, '\n  ')}`);

  console.log('\n--- Step 8: Agent Execution Timeline ---');
  const timeline = app.getTimeline();
  timeline.forEach((item, idx) => {
    console.log(`  [${idx + 1}] [${item.status.toUpperCase()}] Skill: ${item.skill} | Tool: ${item.toolName}`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('  Nayvid Silicon Studio Engine executed successfully!');
  console.log('='.repeat(70) + '\n');
}

// Auto-run when executed directly
const isDirectRun = process.argv[1] && (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'));
if (isDirectRun) {
  main().catch((err) => {
    console.error('Fatal execution error:', err);
    process.exit(1);
  });
}
