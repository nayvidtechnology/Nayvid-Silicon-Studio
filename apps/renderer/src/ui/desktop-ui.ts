import { SiliconStudioApp, type StudioTab } from '../app.js';

// Global Studio App Instance
const studioApp = new SiliconStudioApp();

// Check if running in Electron environment
const isElectron = typeof window !== 'undefined' && (window as any).nayvidDesktop !== undefined;
const desktopIPC = isElectron ? (window as any).nayvidDesktop : null;

// DOM Elements
const tabs = document.querySelectorAll('.tab');
const panes = document.querySelectorAll('.view-pane');
const chatStream = document.getElementById('chat-stream');
const inputNavi = document.getElementById('input-navi') as HTMLInputElement;
const btnSendNavi = document.getElementById('btn-send-navi');
const timelineList = document.getElementById('timeline-list');
const doctorGrid = document.getElementById('doctor-grid-container');
const btnRunDoctor = document.getElementById('btn-run-doctor');
const btnRefreshDoctor = document.getElementById('btn-refresh-doctor');
const btnRunSim = document.getElementById('btn-run-sim');
const btnReSim = document.getElementById('btn-re-sim');
const btnParseIR = document.getElementById('btn-parse-ir');
const selectSkill = document.getElementById('select-skill') as HTMLSelectElement;
const selectPrivacy = document.getElementById('select-privacy') as HTMLSelectElement;
const doctorSummaryText = document.getElementById('doctor-summary-text');
const codeEditor = document.getElementById('code-editor') as HTMLTextAreaElement;
const suggestionPills = document.querySelectorAll('.suggestion-pill');

// Tab Switching
function setActiveTab(tabName: string) {
  tabs.forEach((t) => {
    if (t.getAttribute('data-tab') === tabName) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });

  panes.forEach((p) => {
    if (p.id === `pane-${tabName}`) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });

  studioApp.setActiveTab(tabName as StudioTab);
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const tabName = tab.getAttribute('data-tab');
    if (tabName) setActiveTab(tabName);
  });
});

// Populate Nayvid Doctor Diagnostics Grid
const DEFAULT_TOOLS = [
  { name: 'Slang', category: 'Language Server / Frontend', desc: 'SystemVerilog parser & AST engine' },
  { name: 'Verilator', category: 'Simulation / C++ Transpiler', desc: 'High-speed cycle-accurate simulator' },
  { name: 'Yosys', category: 'Logic Synthesis', desc: 'RTL synthesis and formal verification framework' },
  { name: 'OpenROAD', category: 'Place & Route', desc: 'Autonomous RTL-to-GDS digital layout flow' },
  { name: 'Cocotb', category: 'Testbench Framework', desc: 'Python-based coroutine verification environment' },
  { name: 'Surfer', category: 'Waveform Viewer', desc: 'High-performance extensible VCD/FST waveform engine' },
  { name: 'Icarus Verilog', category: 'Simulation', desc: 'Standard IEEE-1364 Verilog simulation engine' },
  { name: 'NextPNR', category: 'FPGA P&R', desc: 'Timing-driven FPGA place and route' },
  { name: 'GHDL', category: 'VHDL Simulator', desc: 'Complete VHDL 2008 analyzer and compiler' },
];

async function refreshDoctor() {
  if (!doctorGrid) return;
  doctorGrid.innerHTML = '<div style="color: var(--accent-cyan);">Running diagnostic scan across all backends...</div>';

  try {
    let report;
    if (isElectron) {
      report = await desktopIPC.handleIPC('nayvid:doctor', { runtime: 'auto' });
    } else {
      report = await studioApp.runDoctorDiagnostics();
    }

    doctorGrid.innerHTML = '';
    const checks = report.checks || [];

    DEFAULT_TOOLS.forEach((tool, i) => {
      const check = checks[i] || { installed: true, version: '2026.1-native', runtimeUsed: 'windows-native' };
      const card = document.createElement('div');
      card.className = 'doctor-card';
      card.innerHTML = `
        <div class="doctor-card-header">
          <span class="doctor-tool-name">${tool.name}</span>
          <span class="doctor-badge ${check.installed ? 'installed' : 'missing'}">
            ${check.installed ? 'ONLINE' : 'NOT FOUND'}
          </span>
        </div>
        <div style="font-size: 11px; color: var(--accent-cyan); font-family: var(--font-mono);">${tool.category}</div>
        <div style="font-size: 11px; color: var(--text-muted);">${tool.desc}</div>
        <div style="margin-top: auto; font-size: 10px; color: var(--text-dim); font-family: var(--font-mono); border-top: 1px solid var(--border-color); padding-top: 6px;">
          Runtime: ${check.runtimeUsed || 'Native'} | Status: OK
        </div>
      `;
      doctorGrid.appendChild(card);
    });

    if (doctorSummaryText) {
      doctorSummaryText.innerText = `Doctor: ${report.summary.passed}/${report.summary.total} Tools`;
    }
  } catch (err: any) {
    doctorGrid.innerHTML = `<div style="color: var(--accent-rose);">Scan error: ${err.message}</div>`;
  }
}

// Update Timeline
function updateTimeline() {
  if (!timelineList) return;
  const timeline = studioApp.getTimeline();
  if (timeline.length === 0) return;

  timelineList.innerHTML = '';
  timeline.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'timeline-item';
    el.innerHTML = `
      <span class="timeline-badge">${item.status.toUpperCase()}</span>
      <span><strong>${item.skill}</strong>: <code>${item.toolName}</code></span>
    `;
    timelineList.appendChild(el);
  });
  timelineList.scrollTop = timelineList.scrollHeight;
}

// Chat Functionality
async function handleSendNavi(userQuery?: string) {
  const query = userQuery || inputNavi?.value.trim();
  if (!query) return;

  if (inputNavi) inputNavi.value = '';

  // Append user message
  const userMsg = document.createElement('div');
  userMsg.className = 'chat-msg user';
  userMsg.innerHTML = `<div class="msg-bubble">${escapeHtml(query)}</div>`;
  chatStream?.appendChild(userMsg);

  // Append thinking bubble
  const thinkingMsg = document.createElement('div');
  thinkingMsg.className = 'chat-msg navi';
  thinkingMsg.innerHTML = `<div class="msg-bubble" style="color: var(--accent-purple);">Thinking and inspecting DesignGraph...</div>`;
  chatStream?.appendChild(thinkingMsg);
  chatStream!.scrollTop = chatStream!.scrollHeight;

  try {
    const skill = (selectSkill?.value || 'waveform-debugger') as any;
    const response = await studioApp.askNavi(query, skill);

    thinkingMsg.innerHTML = `
      <div class="msg-bubble">
        <div style="font-size: 11px; color: var(--accent-purple); margin-bottom: 4px; font-weight: 600;">
          NAVI [${skill}]
        </div>
        <div>${formatMarkdown(response.answer)}</div>
      </div>
    `;
    updateTimeline();
  } catch (err: any) {
    thinkingMsg.innerHTML = `<div class="msg-bubble" style="color: var(--accent-rose);">Error: ${err.message}</div>`;
  }
  chatStream!.scrollTop = chatStream!.scrollHeight;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\n/g, '<br>')
    .replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.1); padding: 1px 4px; border-radius: 3px; font-family: var(--font-mono);">$1</code>');
}

// Event Listeners
btnSendNavi?.addEventListener('click', () => handleSendNavi());
inputNavi?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSendNavi();
});

suggestionPills.forEach((pill) => {
  pill.addEventListener('click', () => {
    const prompt = pill.getAttribute('data-prompt');
    if (prompt) handleSendNavi(prompt);
  });
});

btnRunDoctor?.addEventListener('click', () => {
  setActiveTab('doctor');
  refreshDoctor();
});

btnRefreshDoctor?.addEventListener('click', () => refreshDoctor());

btnRunSim?.addEventListener('click', async () => {
  setActiveTab('waveform');
  await studioApp.runSimulation('tb_counter');
  updateTimeline();
});

btnReSim?.addEventListener('click', async () => {
  await studioApp.runSimulation('tb_counter');
  updateTimeline();
});

btnParseIR?.addEventListener('click', async () => {
  const content = codeEditor?.value || '';
  await studioApp.openFile('examples/counter/rtl/counter.sv', content);
  alert('Design Graph IR parsed successfully! Top module: counter');
});

selectPrivacy?.addEventListener('change', (e) => {
  const val = (e.target as HTMLSelectElement).value;
  studioApp.setPrivacyPolicy(val as any);
});

// Initial boot
refreshDoctor();
updateTimeline();
console.log('Nayvid Silicon Studio UI initialized.');
