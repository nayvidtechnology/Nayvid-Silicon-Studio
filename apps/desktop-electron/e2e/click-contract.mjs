import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

process.env.VITEST = '1';

const { app, ipcMain } = await import('electron');
const { DesktopBridge, createMainWindow } = await import('../dist/main.js');

const tempRoots = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(window, expression, description, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    try {
      lastValue = await window.webContents.executeJavaScript(expression, true);
      if (lastValue) return lastValue;
    } catch {
      // Renderer may still be loading; retry until timeout.
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}. Last value: ${String(lastValue)}`);
}

async function js(window, source) {
  return window.webContents.executeJavaScript(source, true);
}

async function main() {
  const bridge = new DesktopBridge();
  await app.whenReady();
  ipcMain.handle('desktop:ipc', async (_event, { channel, payload }) => bridge.handleIPC(channel, payload));

  const window = createMainWindow();
  const rendererErrors = [];
  window.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3) rendererErrors.push(message);
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    rendererErrors.push(`render-process-gone:${details.reason}`);
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Electron renderer did not finish loading')), 20_000);
    window.webContents.once('did-finish-load', () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  await waitFor(window, `Boolean(document.querySelector('[data-testid="new-project"]'))`, 'New Project button');
  assert.equal(await js(window, `document.querySelector('[data-testid="active-project"]')?.textContent`), 'No project');

  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'nayvid-electron-e2e-'));
  tempRoots.push(parent);
  const projectRoot = path.join(parent, 'click-contract-chip');

  await js(window, `document.querySelector('[data-testid="new-project"]').click()`);
  await waitFor(window, `!document.querySelector('#project-modal')?.hidden`, 'Create Project modal');
  await js(window, `(() => {
    document.querySelector('[data-testid="project-parent"]').value = ${JSON.stringify(parent)};
    document.querySelector('[data-testid="project-name"]').value = 'click-contract-chip';
    document.querySelector('[data-testid="project-top"]').value = 'chip_top';
    document.querySelector('[data-testid="project-submit"]').click();
    return true;
  })()`);

  await waitFor(window, `document.querySelector('[data-testid="active-project"]')?.textContent === 'click-contract-chip'`, 'project activation');
  const editorValue = await js(window, `document.querySelector('#code-editor')?.value`);
  assert.match(editorValue, /module chip_top/);
  assert.equal(await js(window, `document.querySelector('#sidebar-top-module')?.textContent`), 'chip_top');
  assert.ok(fs.existsSync(path.join(projectRoot, 'nayvid.project.json')), 'manifest should exist');
  assert.ok(fs.existsSync(path.join(projectRoot, 'rtl', 'chip_top.sv')), 'starter RTL should exist');
  assert.ok(fs.existsSync(path.join(projectRoot, 'tb', 'chip_top_tb.sv')), 'starter testbench should exist');
  assert.ok(fs.existsSync(path.join(projectRoot, 'constraints', 'chip_top.sdc')), 'starter constraints should exist');

  await js(window, `(() => {
    const editor = document.querySelector('#code-editor');
    editor.value = editor.value.trimEnd() + '   \\n// e2e-save-marker   \\n';
    document.querySelector('[data-testid="save-rtl"]').click();
    return true;
  })()`);
  await waitFor(window, `document.querySelector('[data-testid="action-status"]')?.textContent?.includes('Saved rtl/chip_top.sv')`, 'RTL save');
  assert.match(fs.readFileSync(path.join(projectRoot, 'rtl', 'chip_top.sv'), 'utf-8'), /e2e-save-marker/);

  await js(window, `document.querySelector('#btn-format-rtl').click()`);
  await waitFor(window, `document.querySelector('[data-testid="action-status"]')?.textContent?.includes('whitespace normalized')`, 'RTL format action');
  const formatted = fs.readFileSync(path.join(projectRoot, 'rtl', 'chip_top.sv'), 'utf-8');
  assert.match(formatted, /e2e-save-marker/);
  assert.doesNotMatch(formatted, /e2e-save-marker   /);

  await js(window, `document.querySelector('#btn-parse-ir').click()`);
  await waitFor(window, `document.querySelector('[data-testid="action-status"]')?.textContent?.includes('Design Graph parsed successfully')`, 'Design Graph parse');

  await js(window, `document.querySelector('.tab[data-tab="diagram"]').click()`);
  await waitFor(window, `document.querySelector('#pane-diagram')?.classList.contains('active')`, 'diagram tab activation');
  await js(window, `document.querySelector('#btn-zoom-in').click()`);
  assert.equal(await js(window, `document.querySelector('#diagram-svg-container svg')?.getAttribute('data-zoom')`), '1.10');
  await js(window, `document.querySelector('#btn-zoom-out').click()`);
  assert.equal(await js(window, `document.querySelector('#diagram-svg-container svg')?.getAttribute('data-zoom')`), '1.00');
  await js(window, `document.querySelector('#btn-zoom-reset').click()`);
  assert.equal(await js(window, `document.querySelector('#diagram-svg-container svg')?.getAttribute('data-zoom')`), '1.00');

  await js(window, `document.querySelector('#btn-run-sim').click()`);
  await waitFor(window, `document.querySelector('[data-testid="action-status"]')?.textContent?.includes('Simulation passed')`, 'real Icarus simulation', 30_000);
  assert.ok(fs.existsSync(path.join(projectRoot, 'sim.vcd')), 'simulation should generate sim.vcd');
  await waitFor(window, `document.querySelector('#wave-result')?.textContent?.includes('Captured')`, 'waveform evidence');

  await js(window, `document.querySelector('#btn-run-doctor').click()`);
  await waitFor(window, `document.querySelector('#pane-doctor')?.classList.contains('active')`, 'Doctor tab');
  await waitFor(window, `document.querySelector('#doctor-summary-text')?.textContent !== 'Doctor: not scanned'`, 'Doctor scan', 20_000);
  await js(window, `document.querySelector('#btn-refresh-doctor').click()`);
  await waitFor(window, `Boolean(document.querySelector('#doctor-grid-container'))`, 'Doctor grid');

  // Verify the Open Project click path with a second project fixture.
  const existingRoot = path.join(parent, 'existing-chip');
  fs.mkdirSync(path.join(existingRoot, 'rtl'), { recursive: true });
  fs.mkdirSync(path.join(existingRoot, 'tb'), { recursive: true });
  fs.writeFileSync(path.join(existingRoot, 'rtl', 'existing_top.sv'), 'module existing_top; endmodule\n');
  fs.writeFileSync(path.join(existingRoot, 'tb', 'existing_top_tb.sv'), 'module existing_top_tb; existing_top dut(); initial begin #1 $finish; end endmodule\n');
  const existingManifest = path.join(existingRoot, 'nayvid.project.json');
  fs.writeFileSync(existingManifest, JSON.stringify({
    schemaVersion: 1,
    name: 'existing-chip',
    topModule: 'existing_top',
    sources: ['rtl/existing_top.sv'],
    verification: { testbenchTop: 'existing_top_tb', sources: ['tb/existing_top_tb.sv'], waveformPath: 'sim.vcd' },
    toolchain: [],
  }, null, 2));

  await js(window, `document.querySelector('[data-testid="open-project"]').click()`);
  await waitFor(window, `!document.querySelector('#project-modal')?.hidden`, 'Open Project modal');
  await js(window, `(() => {
    document.querySelector('[data-testid="project-manifest-path"]').value = ${JSON.stringify(existingManifest)};
    document.querySelector('[data-testid="project-submit"]').click();
    return true;
  })()`);
  await waitFor(window, `document.querySelector('[data-testid="active-project"]')?.textContent === 'existing-chip'`, 'existing project activation');
  assert.match(await js(window, `document.querySelector('#code-editor')?.value`), /module existing_top/);
  assert.equal(await js(window, `document.querySelector('#sidebar-top-module')?.textContent`), 'existing_top');

  assert.deepEqual(rendererErrors, [], `Renderer emitted errors: ${rendererErrors.join(' | ')}`);
  console.log('PASS: Electron project lifecycle, click contract, real simulation, waveform, and Doctor E2E');
  window.close();
  await app.quit();
}

try {
  await main();
} catch (error) {
  console.error('FAIL: Electron click-contract E2E');
  console.error(error);
  process.exitCode = 1;
  try { await app.quit(); } catch {}
} finally {
  for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true });
}
