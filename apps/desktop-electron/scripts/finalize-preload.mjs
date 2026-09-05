import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const compiled = resolve('dist/preload.cjs');
const electronPreload = resolve('dist/preload.js');

if (!existsSync(compiled)) {
  throw new Error(`Sandbox preload build artifact is missing: ${compiled}`);
}

// Electron sandboxed preloads execute as plain/CommonJS JavaScript and cannot
// contain ESM imports. TypeScript emits .cts as .cjs; copy that exact CommonJS
// output to the historical preload.js path consumed by BrowserWindow.
copyFileSync(compiled, electronPreload);
