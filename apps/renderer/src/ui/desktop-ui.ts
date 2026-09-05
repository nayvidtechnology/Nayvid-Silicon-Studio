type DesktopApi = {
  handleIPC(channel: string, payload?: unknown): Promise<any>;
  openFileDialog(): Promise<string | null>;
  selectDirectory(): Promise<string | null>;
  openProjectDialog(): Promise<string | null>;
};

type ProjectDescriptor = {
  root: string;
  manifestPath: string;
  manifest: {
    name: string;
    topModule: string;
    sources: string[];
    constraints?: string[];
    verification?: {
      testbenchTop: string;
      sources: string[];
      output?: string;
      waveformPath: string;
    };
  };
  files: string[];
};

const desktop = (window as any).nayvidDesktop as DesktopApi | undefined;
let currentProject: ProjectDescriptor | null = null;
let currentFile = 'examples/counter/rtl/counter.sv';
let diagramScale = 1;

const tabs = document.querySelectorAll<HTMLElement>('.tab');
const panes = document.querySelectorAll<HTMLElement>('.view-pane');
const chatStream = document.getElementById('chat-stream');
const inputNavi = document.getElementById('input-navi') as HTMLInputElement | null;
const btnSendNavi = document.getElementById('btn-send-navi');
const timelineList = document.getElementById('timeline-list');
const doctorGrid = document.getElementById('doctor-grid-container');
const btnRunDoctor = document.getElementById('btn-run-doctor');
const btnRefreshDoctor = document.getElementById('btn-refresh-doctor');
const btnRunSim = document.getElementById('btn-run-sim');
const btnReSim = document.getElementById('btn-re-sim');
const btnParseIR = document.getElementById('btn-parse-ir');
const btnFormatRtl = document.getElementById('btn-format-rtl');
const selectSkill = document.getElementById('select-skill') as HTMLSelectElement | null;
const selectPrivacy = document.getElementById('select-privacy') as HTMLSelectElement | null;
const doctorSummaryText = document.getElementById('doctor-summary-text');
const codeEditor = document.getElementById('code-editor') as HTMLTextAreaElement | null;
const suggestionPills = document.querySelectorAll<HTMLElement>('.suggestion-pill');
const sidebarHierarchy = document.getElementById('sidebar-hierarchy');
const sidebarTopModule = document.getElementById('sidebar-top-module');

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\n/g, '<br>')
    .replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.1); padding: 1px 4px; border-radius: 3px; font-family: var(--font-mono);">$1</code>');
}

function setActiveTab(tabName: string): void {
  tabs.forEach((tab) => tab.classList.toggle('active', tab.getAttribute('data-tab') === tabName));
  panes.forEach((pane) => pane.classList.toggle('active', pane.id === `pane-${tabName}`));
}

function showStatus(message: string, level: 'info' | 'success' | 'error' = 'info'): void {
  let status = document.getElementById('nayvid-action-status');
  if (!status) {
    status = document.createElement('div');
    status.id = 'nayvid-action-status';
    status.setAttribute('data-testid', 'action-status');
    document.body.appendChild(status);
  }
  status.className = `nayvid-action-status ${level}`;
  status.textContent = message;
}

async function invoke(channel: string, payload?: unknown): Promise<any> {
  if (!desktop) throw new Error('Nayvid desktop API is unavailable. Launch the Electron desktop application.');
  return desktop.handleIPC(channel, payload);
}

function injectProjectUx(): void {
  const style = document.createElement('style');
  style.textContent = `
    .project-chip { display:inline-flex;align-items:center;max-width:220px;padding:6px 9px;border:1px solid var(--border-color);border-radius:6px;color:var(--accent-cyan);font:11px var(--font-mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
    .nayvid-project-modal[hidden] { display:none; }
    .nayvid-project-modal { position:fixed;inset:0;z-index:9999;background:rgba(2,6,23,.78);display:flex;align-items:center;justify-content:center; }
    .nayvid-project-card { width:min(560px,90vw);background:#0f172a;border:1px solid #334155;border-radius:12px;padding:22px;box-shadow:0 24px 80px rgba(0,0,0,.55); }
    .nayvid-project-card h2 { margin:0 0 16px;font-size:18px; }
    .nayvid-project-field { margin:12px 0; }
    .nayvid-project-field label { display:block;margin-bottom:5px;color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em; }
    .nayvid-project-row { display:flex;gap:8px; }
    .nayvid-project-input { width:100%;box-sizing:border-box;background:#0b1120;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:9px;font-family:var(--font-mono); }
    .nayvid-project-actions { display:flex;justify-content:flex-end;gap:8px;margin-top:18px; }
    .nayvid-action-status { position:fixed;z-index:10000;left:18px;bottom:34px;max-width:760px;padding:9px 12px;border-radius:6px;background:#111827;border:1px solid #334155;color:#cbd5e1;font:11px var(--font-mono);box-shadow:0 8px 28px rgba(0,0,0,.35); }
    .nayvid-action-status.success { border-color:#10b981;color:#6ee7b7; }
    .nayvid-action-status.error { border-color:#f43f5e;color:#fda4af; }
    .wave-result { margin-top:10px;padding:10px;border:1px solid var(--border-color);border-radius:6px;font:11px var(--font-mono);color:var(--text-muted); }
  `;
  document.head.appendChild(style);

  const headerActions = document.querySelector('.header-actions');
  if (headerActions) {
    const newButton = document.createElement('button');
    newButton.className = 'btn';
    newButton.id = 'btn-new-project';
    newButton.setAttribute('data-testid', 'new-project');
    newButton.textContent = '＋ New Project';

    const openButton = document.createElement('button');
    openButton.className = 'btn';
    openButton.id = 'btn-open-project';
    openButton.setAttribute('data-testid', 'open-project');
    openButton.textContent = '📂 Open Project';

    const chip = document.createElement('span');
    chip.id = 'active-project-chip';
    chip.className = 'project-chip';
    chip.setAttribute('data-testid', 'active-project');
    chip.textContent = 'No project';

    headerActions.prepend(chip);
    headerActions.prepend(openButton);
    headerActions.prepend(newButton);
  }

  const editorActions = document.querySelector('#pane-rtl .editor-toolbar > div:last-child');
  if (editorActions && !document.getElementById('btn-save-rtl')) {
    const save = document.createElement('button');
    save.className = 'btn btn-primary';
    save.id = 'btn-save-rtl';
    save.setAttribute('data-testid', 'save-rtl');
    save.textContent = '💾 Save RTL';
    editorActions.prepend(save);
  }

  const modal = document.createElement('div');
  modal.id = 'project-modal';
  modal.className = 'nayvid-project-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="nayvid-project-card" role="dialog" aria-modal="true" aria-labelledby="project-modal-title">
      <h2 id="project-modal-title">Create Nayvid Project</h2>
      <div id="create-project-fields">
        <div class="nayvid-project-field"><label>Parent directory</label><div class="nayvid-project-row"><input id="project-parent" data-testid="project-parent" class="nayvid-project-input" placeholder="/workspace/projects"><button id="btn-browse-parent" class="btn">Browse</button></div></div>
        <div class="nayvid-project-field"><label>Project name</label><input id="project-name" data-testid="project-name" class="nayvid-project-input" value="my-silicon-project"></div>
        <div class="nayvid-project-field"><label>Top module</label><input id="project-top" data-testid="project-top" class="nayvid-project-input" value="top"></div>
      </div>
      <div id="open-project-fields" hidden>
        <div class="nayvid-project-field"><label>nayvid.project.json</label><div class="nayvid-project-row"><input id="project-manifest-path" data-testid="project-manifest-path" class="nayvid-project-input" placeholder="/workspace/project/nayvid.project.json"><button id="btn-browse-project" class="btn">Browse</button></div></div>
      </div>
      <div class="nayvid-project-actions"><button id="btn-project-cancel" class="btn">Cancel</button><button id="btn-project-submit" data-testid="project-submit" class="btn btn-primary">Create Project</button></div>
    </div>`;
  document.body.appendChild(modal);
}

function openProjectModal(mode: 'create' | 'open'): void {
  const modal = document.getElementById('project-modal') as HTMLElement | null;
  if (!modal) return;
  const create = document.getElementById('create-project-fields') as HTMLElement;
  const open = document.getElementById('open-project-fields') as HTMLElement;
  const title = document.getElementById('project-modal-title')!;
  const submit = document.getElementById('btn-project-submit') as HTMLButtonElement;
  modal.dataset.mode = mode;
  create.hidden = mode !== 'create';
  open.hidden = mode !== 'open';
  title.textContent = mode === 'create' ? 'Create Nayvid Project' : 'Open Nayvid Project';
  submit.textContent = mode === 'create' ? 'Create Project' : 'Open Project';
  modal.hidden = false;
}

function closeProjectModal(): void {
  const modal = document.getElementById('project-modal');
  if (modal) modal.hidden = true;
}

function renderNavigator(graph: any): void {
  if (!sidebarHierarchy || !graph?.modules) return;
  const module = graph.modules[graph.topModule] ?? Object.values(graph.modules)[0] as any;
  if (!module) return;
  sidebarHierarchy.innerHTML = '';

  const hierarchy = document.createElement('div');
  hierarchy.className = 'nav-section';
  hierarchy.innerHTML = `<div class="nav-section-title">Design Hierarchy</div><div class="nav-item active"><span>📦</span> <strong>${escapeHtml(module.name)}</strong><span class="item-badge">Top</span></div>`;
  sidebarHierarchy.appendChild(hierarchy);

  const ports = document.createElement('div');
  ports.className = 'nav-section';
  ports.innerHTML = '<div class="nav-section-title">Port Interfaces</div>';
  for (const port of module.ports ?? []) {
    const item = document.createElement('div');
    item.className = 'nav-item';
    item.innerHTML = `<span>${port.direction === 'input' ? '→' : '←'}</span> ${escapeHtml(port.name)} [${Math.max(0, Number(port.width || 1) - 1)}:0]<span class="item-badge">${escapeHtml(port.direction)}</span>`;
    ports.appendChild(item);
  }
  sidebarHierarchy.appendChild(ports);

  const domains = document.createElement('div');
  domains.className = 'nav-section';
  domains.innerHTML = `<div class="nav-section-title">Domains & State Machines</div>${(module.clockDomains ?? []).map((v: string) => `<div class="nav-item"><span>⏱️</span> ${escapeHtml(v)}</div>`).join('')}${(module.resetDomains ?? []).map((v: string) => `<div class="nav-item"><span>🔄</span> ${escapeHtml(v)}</div>`).join('')}${(module.fsms ?? []).map((v: any) => `<div class="nav-item"><span>⚡</span> FSM: ${escapeHtml(v.name ?? String(v))}</div>`).join('')}`;
  sidebarHierarchy.appendChild(domains);
}

function updateProjectChrome(project: ProjectDescriptor): void {
  const chip = document.getElementById('active-project-chip');
  if (chip) {
    chip.textContent = project.manifest.name;
    chip.setAttribute('title', project.root);
  }
  if (sidebarTopModule) sidebarTopModule.textContent = project.manifest.topModule;
  const footerTop = document.querySelector('.footer-left span:nth-child(2) strong');
  if (footerTop) footerTop.textContent = project.manifest.topModule;
  const footerFile = document.querySelector('.footer-left span:nth-child(3) span');
  if (footerFile) footerFile.textContent = currentFile;
  if (btnRunSim) btnRunSim.textContent = `▶ Run Sim (${project.manifest.verification?.testbenchTop ?? project.manifest.topModule})`;
}

async function loadProjectFile(filePath: string): Promise<void> {
  if (!currentProject) throw new Error('No active project.');
  const read = await invoke('nayvid:read-file', { path: filePath });
  if (!read?.success) throw new Error(read?.error || `Unable to read ${filePath}`);
  currentFile = filePath;
  if (codeEditor) codeEditor.value = read.content;
  const graph = await invoke('nayvid:studio-open-file', { path: filePath, content: read.content, topModule: currentProject.manifest.topModule });
  renderNavigator(graph);
  updateProjectChrome(currentProject);
}

async function activateProject(project: ProjectDescriptor): Promise<void> {
  currentProject = project;
  currentFile = project.manifest.sources[0];
  updateProjectChrome(project);
  await loadProjectFile(currentFile);
  setActiveTab('rtl');
  showStatus(`Project '${project.manifest.name}' is active.`, 'success');
}

async function refreshDoctor(): Promise<void> {
  if (!doctorGrid) return;
  doctorGrid.innerHTML = '<div style="color: var(--accent-cyan);">Running diagnostic scan across compatible backends...</div>';
  try {
    const report = await invoke('nayvid:doctor', { runtime: 'auto' });
    doctorGrid.innerHTML = '';
    const checks = report.checks || [];
    if (!checks.length) doctorGrid.innerHTML = '<div style="color: var(--text-muted);">No registered tool checks were returned.</div>';
    checks.forEach((check: any) => {
      const tool = check.tool || {};
      const card = document.createElement('div');
      card.className = 'doctor-card';
      card.innerHTML = `<div class="doctor-card-header"><span class="doctor-tool-name">${escapeHtml(tool.name || tool.id || 'Unknown tool')}</span><span class="doctor-badge ${check.installed ? 'installed' : 'missing'}">${check.installed ? 'ONLINE' : 'NOT FOUND'}</span></div><div style="font-size:11px;color:var(--accent-cyan);font-family:var(--font-mono);">${escapeHtml(tool.category || 'tool')}</div><div style="font-size:11px;color:var(--text-muted);">${escapeHtml(check.message || '')}</div><div style="margin-top:auto;font-size:10px;color:var(--text-dim);font-family:var(--font-mono);border-top:1px solid var(--border-color);padding-top:6px;">Runtime: ${escapeHtml(check.runtimeUsed || 'none')} | Version: ${escapeHtml(check.version || '—')}</div>`;
      doctorGrid.appendChild(card);
    });
    if (doctorSummaryText) doctorSummaryText.textContent = `Doctor: ${report.summary.passed}/${report.summary.total} Tools`;
    showStatus(`Doctor completed: ${report.summary.passed}/${report.summary.total} tools available.`, 'success');
  } catch (err: any) {
    doctorGrid.innerHTML = `<div style="color: var(--accent-rose);">Scan error: ${escapeHtml(err?.message || String(err))}</div>`;
    if (doctorSummaryText) doctorSummaryText.textContent = 'Doctor: scan failed';
    showStatus(err?.message || String(err), 'error');
  }
}

async function updateTimeline(): Promise<void> {
  if (!timelineList) return;
  try {
    const timeline = desktop ? await invoke('nayvid:studio-timeline') : [];
    timelineList.innerHTML = '';
    if (!timeline.length) {
      timelineList.innerHTML = '<div style="color: var(--text-dim); font-size: 11px;">No agent activity yet.</div>';
      return;
    }
    timeline.forEach((item: any) => {
      const el = document.createElement('div');
      el.className = 'timeline-item';
      el.innerHTML = `<span class="timeline-badge">${escapeHtml(String(item.status).toUpperCase())}</span><span><strong>${escapeHtml(item.skill)}</strong>: <code>${escapeHtml(item.toolName)}</code></span>`;
      timelineList.appendChild(el);
    });
    timelineList.scrollTop = timelineList.scrollHeight;
  } catch {
    timelineList.innerHTML = '<div style="color: var(--text-dim); font-size: 11px;">Timeline unavailable.</div>';
  }
}

async function handleSendNavi(userQuery?: string): Promise<void> {
  const query = userQuery || inputNavi?.value.trim();
  if (!query) return;
  if (inputNavi) inputNavi.value = '';
  const userMsg = document.createElement('div');
  userMsg.className = 'chat-msg user';
  userMsg.innerHTML = `<div class="msg-bubble">${escapeHtml(query)}</div>`;
  chatStream?.appendChild(userMsg);
  const thinking = document.createElement('div');
  thinking.className = 'chat-msg navi';
  thinking.innerHTML = '<div class="msg-bubble" style="color: var(--accent-purple);">NAVI is reasoning from the active project...</div>';
  chatStream?.appendChild(thinking);
  try {
    const skill = selectSkill?.value || 'waveform-debugger';
    const response = await invoke('nayvid:studio-navi', { query, skill, options: {} });
    thinking.innerHTML = `<div class="msg-bubble"><div style="font-size:11px;color:var(--accent-purple);margin-bottom:4px;font-weight:600;">NAVI [${escapeHtml(skill)}]</div><div>${formatMarkdown(response.answer)}</div></div>`;
  } catch (err: any) {
    thinking.innerHTML = `<div class="msg-bubble" style="color: var(--accent-rose);">NAVI unavailable: ${escapeHtml(err?.message || String(err))}</div>`;
  }
  await updateTimeline();
  if (chatStream) chatStream.scrollTop = chatStream.scrollHeight;
}

function renderWaveResult(wave: any): void {
  let result = document.getElementById('wave-result');
  if (!result) {
    result = document.createElement('div');
    result.id = 'wave-result';
    result.className = 'wave-result';
    document.querySelector('#pane-waveform .waveform-container')?.appendChild(result);
  }
  const names = (wave?.signals ?? []).map((signal: any) => signal.fullName || signal.name).slice(0, 20);
  result.textContent = `Captured ${(wave?.signals ?? []).length} signals${names.length ? `: ${names.join(', ')}` : ''}`;
}

async function runSimulationFromUi(): Promise<void> {
  if (!currentProject?.manifest.verification) {
    showStatus('This project does not define a verification testbench in nayvid.project.json.', 'error');
    return;
  }
  try {
    setActiveTab('waveform');
    showStatus('Running real simulation...', 'info');
    const verification = currentProject.manifest.verification;
    const wave = await invoke('nayvid:studio-simulation', {
      topModule: verification.testbenchTop,
      files: [...currentProject.manifest.sources, ...verification.sources],
      output: verification.output,
      waveformPath: verification.waveformPath,
    });
    renderWaveResult(wave);
    showStatus(`Simulation passed and waveform '${verification.waveformPath}' was parsed.`, 'success');
  } catch (err: any) {
    showStatus(`Simulation failed: ${err?.message || String(err)}`, 'error');
  } finally {
    await updateTimeline();
  }
}

async function parseCurrentRtl(): Promise<void> {
  try {
    const content = codeEditor?.value || '';
    const topModule = currentProject?.manifest.topModule;
    const graph = await invoke('nayvid:studio-open-file', { path: currentFile, content, topModule });
    renderNavigator(graph);
    showStatus(`Design Graph parsed successfully. Top module: ${graph.topModule}`, 'success');
  } catch (err: any) {
    showStatus(`IR parse failed: ${err?.message || String(err)}`, 'error');
  }
}

async function saveCurrentRtl(): Promise<void> {
  if (!currentProject) {
    showStatus('Create or open a project before saving.', 'error');
    return;
  }
  try {
    await invoke('nayvid:write-file', { path: currentFile, content: codeEditor?.value || '' });
    showStatus(`Saved ${currentFile}`, 'success');
  } catch (err: any) {
    showStatus(`Save failed: ${err?.message || String(err)}`, 'error');
  }
}

async function formatCurrentRtl(): Promise<void> {
  try {
    const result = await invoke('nayvid:format-rtl', { path: currentProject ? currentFile : undefined, content: codeEditor?.value || '' });
    if (codeEditor) codeEditor.value = result.content;
    showStatus('RTL whitespace normalized deterministically. External formatter is not required.', 'success');
  } catch (err: any) {
    showStatus(`Format failed: ${err?.message || String(err)}`, 'error');
  }
}

function updateDiagramScale(): void {
  const svg = document.querySelector<SVGElement>('#diagram-svg-container svg');
  if (!svg) return;
  svg.style.transformOrigin = 'center center';
  svg.style.transform = `scale(${diagramScale})`;
  svg.style.transition = 'transform 120ms ease-out';
  svg.setAttribute('data-zoom', diagramScale.toFixed(2));
}

function wireEvents(): void {
  tabs.forEach((tab) => tab.addEventListener('click', () => {
    const name = tab.getAttribute('data-tab');
    if (name) setActiveTab(name);
  }));

  document.getElementById('btn-new-project')?.addEventListener('click', () => openProjectModal('create'));
  document.getElementById('btn-open-project')?.addEventListener('click', () => openProjectModal('open'));
  document.getElementById('btn-project-cancel')?.addEventListener('click', closeProjectModal);
  document.getElementById('btn-browse-parent')?.addEventListener('click', async () => {
    const selected = await desktop?.selectDirectory();
    const input = document.getElementById('project-parent') as HTMLInputElement | null;
    if (selected && input) input.value = selected;
  });
  document.getElementById('btn-browse-project')?.addEventListener('click', async () => {
    const selected = await desktop?.openProjectDialog();
    const input = document.getElementById('project-manifest-path') as HTMLInputElement | null;
    if (selected && input) input.value = selected;
  });
  document.getElementById('btn-project-submit')?.addEventListener('click', async () => {
    const modal = document.getElementById('project-modal') as HTMLElement;
    const mode = modal.dataset.mode || 'create';
    try {
      const project = mode === 'create'
        ? await invoke('nayvid:project-create', {
            parentDirectory: (document.getElementById('project-parent') as HTMLInputElement).value,
            name: (document.getElementById('project-name') as HTMLInputElement).value,
            topModule: (document.getElementById('project-top') as HTMLInputElement).value,
          })
        : await invoke('nayvid:project-open', { path: (document.getElementById('project-manifest-path') as HTMLInputElement).value });
      closeProjectModal();
      await activateProject(project);
    } catch (err: any) {
      showStatus(`${mode === 'create' ? 'Create' : 'Open'} project failed: ${err?.message || String(err)}`, 'error');
    }
  });

  btnSendNavi?.addEventListener('click', () => void handleSendNavi());
  inputNavi?.addEventListener('keydown', (event) => { if (event.key === 'Enter') void handleSendNavi(); });
  suggestionPills.forEach((pill) => pill.addEventListener('click', () => {
    const prompt = pill.getAttribute('data-prompt');
    if (prompt) void handleSendNavi(prompt);
  }));
  btnRunDoctor?.addEventListener('click', () => { setActiveTab('doctor'); void refreshDoctor(); });
  btnRefreshDoctor?.addEventListener('click', () => void refreshDoctor());
  btnRunSim?.addEventListener('click', () => void runSimulationFromUi());
  btnReSim?.addEventListener('click', () => void runSimulationFromUi());
  btnParseIR?.addEventListener('click', () => void parseCurrentRtl());
  btnFormatRtl?.addEventListener('click', () => void formatCurrentRtl());
  document.getElementById('btn-save-rtl')?.addEventListener('click', () => void saveCurrentRtl());
  document.getElementById('btn-zoom-in')?.addEventListener('click', () => { diagramScale = Math.min(2, diagramScale + 0.1); updateDiagramScale(); });
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => { diagramScale = Math.max(0.5, diagramScale - 0.1); updateDiagramScale(); });
  document.getElementById('btn-zoom-reset')?.addEventListener('click', () => { diagramScale = 1; updateDiagramScale(); });
  selectPrivacy?.addEventListener('change', (event) => void invoke('nayvid:studio-privacy', { policy: (event.target as HTMLSelectElement).value }).catch((err) => showStatus(err.message, 'error')));
}

async function initialize(): Promise<void> {
  injectProjectUx();
  wireEvents();
  if (doctorSummaryText) doctorSummaryText.textContent = 'Doctor: not scanned';
  if (!desktop) {
    showStatus('Desktop API unavailable. Use the Electron application for project and EDA actions.', 'error');
    return;
  }
  try {
    const project = await invoke('nayvid:project-current');
    if (project) await activateProject(project);
    else showStatus('No active project. Use New Project or Open Project to begin.', 'info');
  } catch (err: any) {
    showStatus(`Desktop initialization failed: ${err?.message || String(err)}`, 'error');
  }
  await updateTimeline();
}

void initialize();
console.log('Nayvid Silicon Studio desktop UI initialized.');
