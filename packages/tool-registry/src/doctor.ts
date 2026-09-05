import { ExecutionRuntimeManager, type RuntimeType } from '@nayvid/execution-runtime';
import { ToolRegistry } from './tools.js';
import type { DoctorReport, ToolCheckResult, ToolDefinition } from './types.js';

export class NayvidDoctorService {
  constructor(
    private registry: ToolRegistry = new ToolRegistry(),
    private runtimeManager: ExecutionRuntimeManager = new ExecutionRuntimeManager()
  ) {}

  async checkTool(tool: ToolDefinition, preferredRuntime: RuntimeType = 'auto'): Promise<ToolCheckResult> {
    try {
      const backend = await this.runtimeManager.resolveBestBackendFor(tool.supportedRuntimes, preferredRuntime);
      const probeArgs = tool.probeArgs ?? [tool.versionFlag ?? '--version'];
      const res = await backend.execute(tool.binaryName, probeArgs, { timeoutMs: 5000 });
      const rawOutput = (res.stdout + '\n' + res.stderr).trim();
      const installed = res.code === 0;
      const firstLine = rawOutput.split('\n').find(Boolean) || '';

      return {
        tool,
        installed,
        version: installed ? (firstLine.slice(0, 140) || 'Installed') : undefined,
        runtimeUsed: backend.type,
        message: installed
          ? `Detected on ${backend.type}`
          : `${tool.binaryName} exited with code ${res.code} on ${backend.type}${firstLine ? `: ${firstLine}` : ''}`,
      };
    } catch (err: any) {
      return {
        tool,
        installed: false,
        runtimeUsed: preferredRuntime,
        message: err?.message || 'No compatible execution backend available',
      };
    }
  }

  async runDiagnostics(preferredRuntime: RuntimeType = 'auto'): Promise<DoctorReport> {
    const tools = this.registry.getAllTools();
    const checks = await Promise.all(tools.map((tool) => this.checkTool(tool, preferredRuntime)));
    const passed = checks.filter((c) => c.installed).length;
    const failed = checks.length - passed;

    return {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      checks,
      summary: { total: checks.length, passed, failed },
    };
  }
}
