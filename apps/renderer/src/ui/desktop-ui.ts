import { SiliconStudioApp, type StudioTab } from '../app.js';

const studioApp = new SiliconStudioApp();
const isElectron = typeof window !== 'undefined' && (window as any).nayvidDesktop !== undefined;
const desktopIPC = isElectron ? (window as any).nayvidDesktop : null;

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

function setActiveTab(tabName: string) {
  tabs.forEach((t) => t.classList.toggle('active', t.getAttribute('data-tab') === tabName));
  panes.forEach((p) => p.classList.toggle('active', p.id === `pane-${tabName}`));
  studioApp.setActiveTab(tabName as StudioTab);
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const tabName = tab.getAttribute('data-tab');
    if (tabName) setActiveTab(tabName);
  });
});

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\n/g, '<br>')
    .replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.1); padding: 1px 4px; border-radius: 3px; font-family: var(--font-mono);">$1</code>');
}

async function refreshDoctor() {
  if (!doctorGrid) return;
  doctorGrid.innerHTML = '<div style="color: var(--accent-cyan);">Running diagnostic scan across compatible backends...</div>';

  try {
    const report = isElectron
      ? await desktopIPC.handleIPC('nayvid:doctor', { runtime: 'auto' })
      : await studioApp.runDoctorDiagnostics();

    doctorGrid.innerHTML = '';
    const checks = report.checks || [];
    if (checks.length === 0) {
      doctorGrid.innerHTML = '<div style="color: var(--text-muted);">No registered tool checks were returned.</div>';
    }

    checks.forEach((check: any) => {
      const tool = check.tool || {};
      const card = document.createElement('div');
      card.className = 'doctor-card';
      const status = check.installed ? 'ONLINE' : 'NOT FOUND';
      const version = check.version ? escapeHtml(String(check.version)) : '—';
      const message = check.message ? escapeHtml(String(check.message)) : '';
      card.innerHTML = `
        <div class="doctor-card-header">
          <span class="doctor-tool-name">${escapeHtml(tool.name || tool.id || 'Unknown tool')}</span>
          <span class="doctor-badge ${check.installed ? 'installed' : 'missing'}">${status}</span>
        </div>
        <div style="font-size: 11px; color: var(--accent-cyan); font-family: var(--font-mono);">${escapeHtml(tool.category || 'tool')}</div>
        <div style="font-size: 11px; color: var(--text-muted);">${message}</div>
        <div style="margin-top: auto; font-size: 10px; color: var(--text-dim); font-family: var(--font-mono); border-top: 1px solid var(--border-color); padding-top: 6px;">
          Runtime: ${escapeHtml(check.runtimeUsed || 'none')} | Version: ${version}
        </div>
      `;
      doctorGrid.appendChild(card);
    });

    if (doctorSummaryText) {
      doctorSummaryText.innerText = `Doctor: ${report.summary.passed}/${report.summary.total} Tools`;
    }
  } catch (err: any) {
    doctorGrid.innerHTML = `<div style="color: var(--accent-rose);">Scan error: ${escapeHtml(err?.message || String(err))}</div>`;
    if (doctorSummaryText) doctorSummaryText.innerText = 'Doctor: scan failed';
  }
}

function updateTimeline() {
  if (!timelineList) return;
  const timeline = studioApp.getTimeline();
  timelineList.innerHTML = '';
  if (timeline.length === 0) {
    timelineList.innerHTML = '<div style="color: var(--text-dim); font-size: 11px;">No agent activity yet.</div>';
    return;
  }

  timeline.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'timeline-item';
    el.innerHTML = `
      <span class="timeline-badge">${escapeHtml(item.status.toUpperCase())}</span>
      <span><strong>${escapeHtml(item.skill)}</strong>: <code>${escapeHtml(item.toolName)}</code></span>
    `;
    timelineList.appendChild(el);
  });
  timelineList.scrollTop = timelineList.scrollHeight;
}

async function handleSendNavi(userQuery?: string) {
  const query = userQuery || inputNavi?.value.trim();
  if (!query) return;
  if (inputNavi) inputNavi.value = '';

  const userMsg = document.createElement('div');
  userMsg.className = 'chat-msg user';
  userMsg.innerHTML = `<div class="msg-bubble">${escapeHtml(query)}</div>`;
  chatStream?.appendChild(userMsg);

  const thinkingMsg = document.createElement('div');
  thinkingMsg.className = 'chat-msg navi';
  thinkingMsg.innerHTML = '<div class="msg-bubble" style="color: var(--accent-purple);">Thinking and inspecting DesignGraph...</div>';
  chatStream?.appendChild(thinkingMsg);
  if (chatStream) chatStream.scrollTop = chatStream.scrollHeight;

  try {
    const skill = (selectSkill?.value || 'waveform-debugger') as any;
    const response = await studioApp.askNavi(query, skill);
    thinkingMsg.innerHTML = `
      <div class="msg-bubble">
        <div style="font-size: 11px; color: var(--accent-purple); margin-bottom: 4px; font-weight: 600;">NAVI [${escapeHtml(skill)}]</div>
        <div>${formatMarkdown(response.answer)}</div>
      </div>
    `;
    updateTimeline();
  } catch (err: any) {
    thinkingMsg.innerHTML = `<div class="msg-bubble" style="color: var(--accent-rose);">Error: ${escapeHtml(err?.message || String(err))}</div>`;
  }
  if (chatStream) chatStream.scrollTop = chatStream.scrollHeight;
}

async function runSimulationFromUi() {
  try {
    setActiveTab('waveform');
    await studioApp.runSimulation({
      topModule: 'counter',
      files: ['examples/counter/rtl/counter.sv'],
      waveformPath: 'sim.vcd',
    });
  } catch (err: any) {
    const msg = document.createElement('div');
    msg.className = 'timeline-item';
    msg.innerHTML = `<span class="timeline-badge">FAILED</span><span>${escapeHtml(err?.message || String(err))}</span>`;
    timelineList?.appendChild(msg);
  } finally {
    updateTimeline();
  }
}

btnSendNavi?.addEventListener('click', () => handleSendNavi());
inputNavi?.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSendNavi(); });
suggestionPills.forEach((pill) => pill.addEventListener('click', () => {
  const prompt = pill.getAttribute('data-prompt');
  if (prompt) handleSendNavi(prompt);
}));
btnRunDoctor?.addEventListener('click', () => { setActiveTab('doctor'); refreshDoctor(); });
btnRefreshDoctor?.addEventListener('click', () => refreshDoctor());
btnRunSim?.addEventListener('click', runSimulationFromUi);
btnReSim?.addEventListener('click', runSimulationFromUi);
btnParseIR?.addEventListener('click', async () => {
  try {
    const content = codeEditor?.value || '';
    const graph = await studioApp.openFile('examples/counter/rtl/counter.sv', content);
    window.alert(`Design Graph IR parsed successfully. Top module: ${graph.topModule}`);
  } catch (err: any) {
    window.alert(`IR parse failed: ${err?.message || String(err)}`);
  }
});
selectPrivacy?.addEventListener('change', (e) => studioApp.setPrivacyPolicy((e.target as HTMLSelectElement).value as any));

refreshDoctor();
updateTimeline();
console.log('Nayvid Silicon Studio UI initialized.');
