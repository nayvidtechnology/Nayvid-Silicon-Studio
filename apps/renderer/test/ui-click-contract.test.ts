import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rendererRoot = path.resolve(__dirname, '..');

function staticButtonIds(html: string): string[] {
  const ids: string[] = [];
  const buttonPattern = /<button\b[^>]*\bid="([^"]+)"[^>]*>/g;
  for (const match of html.matchAll(buttonPattern)) ids.push(match[1]);
  return ids;
}

describe('desktop UI click contract', () => {
  it('references every static visible button id from the desktop controller', () => {
    const html = fs.readFileSync(path.join(rendererRoot, 'index.html'), 'utf-8');
    const controller = fs.readFileSync(path.join(rendererRoot, 'src', 'ui', 'desktop-ui.ts'), 'utf-8');
    const ids = staticButtonIds(html);
    expect(ids.length).toBeGreaterThan(0);

    const unreferenced = ids.filter((id) => !controller.includes(id));
    expect(unreferenced, `Visible buttons without a desktop click contract: ${unreferenced.join(', ')}`).toEqual([]);
  });

  it('wires id-less tab and suggestion button classes and project controls', () => {
    const controller = fs.readFileSync(path.join(rendererRoot, 'src', 'ui', 'desktop-ui.ts'), 'utf-8');
    expect(controller).toContain("querySelectorAll<HTMLElement>('.tab')");
    expect(controller).toContain("querySelectorAll<HTMLElement>('.suggestion-pill')");
    for (const control of ['btn-new-project', 'btn-open-project', 'btn-save-rtl', 'btn-project-submit']) {
      expect(controller).toContain(control);
    }
  });
});
