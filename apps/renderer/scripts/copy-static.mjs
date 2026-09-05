import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const uiDist = path.join(dist, 'ui');

fs.mkdirSync(uiDist, { recursive: true });
fs.copyFileSync(path.join(root, 'src', 'ui', 'styles.css'), path.join(uiDist, 'styles.css'));

const sourceHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf-8');
const browserHtml = sourceHtml
  .replace('./src/ui/styles.css', './ui/styles.css')
  .replace('./src/ui/desktop-ui.js', './ui/desktop-ui.js');
fs.writeFileSync(path.join(dist, 'index.html'), browserHtml, 'utf-8');

console.log('Renderer static assets emitted to dist/.');
