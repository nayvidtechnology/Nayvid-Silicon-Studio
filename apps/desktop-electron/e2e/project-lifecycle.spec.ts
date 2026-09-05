import { test, expect, _electron as electron } from '@playwright/test';
import electronPath from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');

async function launchStudio() {
  const app = await electron.launch({
    executablePath: String(electronPath),
    args: ['.'],
    cwd: packageRoot,
    env: { ...process.env, NODE_ENV: 'test' },
    timeout: 30_000,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

test('creates a project and every critical project/editor/sim click performs an observable action', async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'nayvid-playwright-'));
  const projectRoot = path.join(parent, 'playwright-chip');
  const { app, page } = await launchStudio();
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  try {
    await expect(page.getByTestId('new-project')).toBeVisible();
    await expect(page.getByTestId('active-project')).toHaveText('No project');

    await page.getByTestId('new-project').click();
    await expect(page.locator('#project-modal')).toBeVisible();
    await page.getByTestId('project-parent').fill(parent);
    await page.getByTestId('project-name').fill('playwright-chip');
    await page.getByTestId('project-top').fill('chip_top');
    await page.getByTestId('project-submit').click();

    await expect(page.getByTestId('active-project')).toHaveText('playwright-chip');
    await expect(page.locator('#code-editor')).toHaveValue(/module chip_top/);
    expect(fs.existsSync(path.join(projectRoot, 'nayvid.project.json'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'rtl', 'chip_top.sv'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'tb', 'chip_top_tb.sv'))).toBe(true);

    const original = await page.locator('#code-editor').inputValue();
    await page.locator('#code-editor').fill(`${original.trimEnd()}   \n// playwright-save-marker   \n`);
    await page.getByTestId('save-rtl').click();
    await expect(page.getByTestId('action-status')).toContainText('Saved rtl/chip_top.sv');
    expect(fs.readFileSync(path.join(projectRoot, 'rtl', 'chip_top.sv'), 'utf-8')).toContain('playwright-save-marker');

    await page.locator('#btn-format-rtl').click();
    await expect(page.getByTestId('action-status')).toContainText('whitespace normalized');
    const formatted = fs.readFileSync(path.join(projectRoot, 'rtl', 'chip_top.sv'), 'utf-8');
    expect(formatted).toContain('// playwright-save-marker');
    expect(formatted).not.toContain('// playwright-save-marker   ');

    await page.locator('#btn-parse-ir').click();
    await expect(page.getByTestId('action-status')).toContainText('Design Graph parsed successfully');
    await expect(page.locator('#sidebar-top-module')).toHaveText('chip_top');

    await page.locator('.tab[data-tab="diagram"]').click();
    await expect(page.locator('#pane-diagram')).toHaveClass(/active/);
    await page.locator('#btn-zoom-in').click();
    await expect(page.locator('#diagram-svg-container svg')).toHaveAttribute('data-zoom', '1.10');
    await page.locator('#btn-zoom-out').click();
    await expect(page.locator('#diagram-svg-container svg')).toHaveAttribute('data-zoom', '1.00');
    await page.locator('#btn-zoom-reset').click();
    await expect(page.locator('#diagram-svg-container svg')).toHaveAttribute('data-zoom', '1.00');

    await page.locator('#btn-run-sim').click();
    await expect(page.getByTestId('action-status')).toContainText('Simulation passed', { timeout: 30_000 });
    expect(fs.existsSync(path.join(projectRoot, 'sim.vcd'))).toBe(true);
    await expect(page.locator('#wave-result')).toContainText('Captured');

    await page.locator('#btn-run-doctor').click();
    await expect(page.locator('#pane-doctor')).toHaveClass(/active/);
    await expect(page.locator('#doctor-summary-text')).not.toHaveText('Doctor: not scanned', { timeout: 20_000 });
    await page.locator('#btn-refresh-doctor').click();
    await expect(page.locator('#doctor-grid-container')).toBeVisible();

    expect(pageErrors).toEqual([]);
  } finally {
    await app.close();
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('opens an existing project from the UI and binds the editor to that project', async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'nayvid-playwright-open-'));
  const root = path.join(parent, 'existing-chip');
  fs.mkdirSync(path.join(root, 'rtl'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tb'), { recursive: true });
  fs.writeFileSync(path.join(root, 'rtl', 'existing_top.sv'), 'module existing_top; endmodule\n');
  fs.writeFileSync(path.join(root, 'tb', 'existing_top_tb.sv'), 'module existing_top_tb; existing_top dut(); initial begin #1 $finish; end endmodule\n');
  const manifestPath = path.join(root, 'nayvid.project.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    name: 'existing-chip',
    topModule: 'existing_top',
    sources: ['rtl/existing_top.sv'],
    verification: { testbenchTop: 'existing_top_tb', sources: ['tb/existing_top_tb.sv'], waveformPath: 'sim.vcd' },
    toolchain: [],
  }, null, 2));

  const { app, page } = await launchStudio();
  try {
    await page.getByTestId('open-project').click();
    await expect(page.locator('#project-modal')).toBeVisible();
    await page.getByTestId('project-manifest-path').fill(manifestPath);
    await page.getByTestId('project-submit').click();
    await expect(page.getByTestId('active-project')).toHaveText('existing-chip');
    await expect(page.locator('#code-editor')).toHaveValue(/module existing_top/);
    await expect(page.locator('#sidebar-top-module')).toHaveText('existing_top');
  } finally {
    await app.close();
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
