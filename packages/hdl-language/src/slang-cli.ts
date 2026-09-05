import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { ExecutionRuntimeManager, type RuntimeType } from '@nayvid/execution-runtime';
import type { DesignGraph, DesignInstance, DesignModule, DesignPort, DesignSignal, PortDirection } from '@nayvid/design-ir';
import { parseSystemVerilogContent } from './index.js';

export interface SlangElaborationRequest {
  workspaceRoot: string;
  files: string[];
  topModule: string;
  includeDirs?: string[];
  defines?: Record<string, string | number | boolean>;
  parameters?: Record<string, string | number | boolean>;
  runtime?: RuntimeType;
}

export interface SlangElaborationResult {
  graph: DesignGraph;
  astPath: string;
  stdout: string;
  stderr: string;
  runtimeUsed: RuntimeType;
}

interface JsonNode { kind?: string; name?: string; body?: JsonNode; members?: JsonNode[]; direction?: string; type?: unknown; definition?: string; [key: string]: unknown; }

function normalizeDirection(value?: string): PortDirection {
  const v = (value ?? '').toLowerCase();
  if (v === 'out' || v === 'output') return 'output';
  if (v === 'inout') return 'inout';
  return 'input';
}

function typeText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return JSON.stringify(value);
  return 'logic';
}

function widthFromType(value: unknown): number {
  const text = typeText(value);
  const match = text.match(/\[\s*(-?\d+)\s*:\s*(-?\d+)\s*\]/);
  if (!match) return 1;
  return Math.abs(Number(match[1]) - Number(match[2])) + 1;
}

function collectInstances(root: JsonNode): JsonNode[] {
  const found: JsonNode[] = [];
  const visited = new Set<object>();
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (visited.has(node as object)) return;
    visited.add(node as object);
    const obj = node as JsonNode;
    if (obj.kind === 'Instance' && obj.body?.kind === 'InstanceBody') found.push(obj);
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(root);
  return found;
}

export function designGraphFromSlangAst(ast: JsonNode, topModule: string, sourceFiles: string[], sourceTextByFile: Record<string, string> = {}): DesignGraph {
  const modules: Record<string, DesignModule> = {};
  const instances = collectInstances(ast);
  for (const instance of instances) {
    const body = instance.body!;
    const moduleName = String(body.name || instance.name || 'unknown');
    if (modules[moduleName]) continue;
    const ports: DesignPort[] = [];
    const signals: DesignSignal[] = [];
    const children: DesignInstance[] = [];
    for (const member of body.members ?? []) {
      if (member.kind === 'Port') {
        const name = String(member.name || 'unnamed');
        const port: DesignPort = { name, direction: normalizeDirection(member.direction as string | undefined), width: widthFromType(member.type), type: typeText(member.type) };
        ports.push(port);
        signals.push({ name, width: port.width, isRegister: false, drivers: [], loads: [], driverExpressions: [], dependsOn: [] });
      } else if (member.kind === 'Variable' || member.kind === 'Net') {
        const name = String(member.name || 'unnamed');
        if (!signals.some((signal) => signal.name === name)) signals.push({ name, width: widthFromType(member.type), isRegister: member.kind === 'Variable', drivers: [], loads: [], driverExpressions: [], dependsOn: [] });
      } else if (member.kind === 'Instance') {
        children.push({ name: String(member.name || 'u_unknown'), moduleName: String(member.body?.name || member.definition || 'unknown'), portConnections: {} });
      }
    }

    const sourceFile = sourceFiles.find((file) => sourceTextByFile[file]?.includes(`module ${moduleName}`)) ?? sourceFiles[0] ?? '<slang-ast>';
    const heuristic = sourceTextByFile[sourceFile] ? parseSystemVerilogContent(sourceTextByFile[sourceFile], sourceFile).find((mod) => mod.name === moduleName) : undefined;
    if (heuristic) {
      for (const signal of signals) {
        const enriched = heuristic.signals.find((candidate) => candidate.name === signal.name);
        if (enriched) Object.assign(signal, enriched, { width: signal.width || enriched.width });
      }
    }
    modules[moduleName] = {
      name: moduleName,
      file: sourceFile,
      ports,
      signals,
      instances: children,
      fsms: heuristic?.fsms ?? [],
      clockDomains: heuristic?.clockDomains ?? [],
      resetDomains: heuristic?.resetDomains ?? [],
    };
  }
  const names = Object.keys(modules);
  if (!names.length) throw new Error('slang AST did not contain any elaborated instances');
  return { topModule: modules[topModule] ? topModule : names[0], modules };
}

export class SlangCliAdapter {
  constructor(private runtimeManager = new ExecutionRuntimeManager()) {}

  async elaborate(request: SlangElaborationRequest): Promise<SlangElaborationResult> {
    const root = path.resolve(request.workspaceRoot);
    const relative = (value: string) => {
      const absolute = path.resolve(root, value);
      const rel = path.relative(root, absolute);
      if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Path escapes workspace: ${value}`);
      return rel.replace(/\\/g, '/');
    };
    const files = request.files.map(relative);
    const sourceTextByFile: Record<string, string> = {};
    for (const file of files) sourceTextByFile[file] = fs.readFileSync(path.join(root, file), 'utf-8');
    const key = createHash('sha256').update(JSON.stringify({ files, top: request.topModule, defines: request.defines, params: request.parameters })).digest('hex').slice(0, 20);
    const cacheDir = path.join(root, '.nayvid', 'cache', 'slang');
    fs.mkdirSync(cacheDir, { recursive: true });
    const astRelative = `.nayvid/cache/slang/${key}.json`;
    const astPath = path.join(root, astRelative);
    const args = ['--top', request.topModule, '--ast-json', astRelative, '--ast-json-source-info', '--ast-json-detailed-types'];
    for (const include of request.includeDirs ?? []) args.push(`-I${relative(include)}`);
    for (const [name, value] of Object.entries(request.defines ?? {})) args.push(`-D${name}=${String(value)}`);
    for (const [name, value] of Object.entries(request.parameters ?? {})) args.push('-G', `${name}=${String(value)}`);
    args.push(...files);
    const backend = await this.runtimeManager.resolveBestBackendFor({ 'native-windows': 'supported', wsl2: 'preferred', linux: 'supported', docker: 'supported', auto: 'supported' }, request.runtime ?? 'auto');
    const result = await backend.execute('slang', args, { cwd: root, timeoutMs: 180000 });
    if (result.code !== 0) throw new Error(`slang elaboration failed (${result.code}): ${result.stderr || result.stdout}`);
    if (!fs.existsSync(astPath)) throw new Error(`slang completed but AST JSON was not produced: ${astRelative}`);
    const ast = JSON.parse(fs.readFileSync(astPath, 'utf-8')) as JsonNode;
    return { graph: designGraphFromSlangAst(ast, request.topModule, files, sourceTextByFile), astPath, stdout: result.stdout, stderr: result.stderr, runtimeUsed: backend.type };
  }
}
