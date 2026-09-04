import { ExecutionRuntimeManager, type RuntimeType } from '@nayvid/execution-runtime';
import { ToolRegistry } from './tools.js';
import type { DoctorReport, ToolCheckResult, ToolDefinition } from './types.js';

export class NayvidDoctorService {
  constructor(
    private registry: ToolRegistry = new ToolRegistry(),
    private runtimeManager: ExecutionRuntimeManager = new ExecutionRuntimeManager()
  ) {}

  async checkTool(tool: ToolDefinition, preferredRuntime: RuntimeType = 'auto'): Promise<ToolCheckResult> {
    const backend = await this.runtimeManager.resolveBestBackend(preferredRuntime);
    const flag = tool.versionFlag ?? '--version';

    try {
      const res = await backend.execute(tool.binaryName, [flag], { timeoutMs: 5000 });
      const installed = res.code === 0 || res.stdout.length > 0 || res.stderr.length > 0;
      const rawOutput = (res.stdout + '\n' + res.stderr).trim();
      const firstLine = rawOutput.split('\n')[0] || '';

      return {
        tool,
        installed,
        version: installed ? (firstLine.slice(0, 100) || 'Installed') : undefined,
        runtimeUsed: backend.type,
        message: installed ? `Detected on ${backend.type}` : `Command ${tool.binaryName} not found on ${backend.type}`,
      };
    } catch (err: any) {
      return {
        tool,
        installed: false,
        runtimeUsed: backend.type,
        message: err.message || 'Execution failed',
      };
    }
  }

  async runDiagnostics(preferredRuntime: RuntimeType = 'auto'): Promise<DoctorReport> {
    const tools = this.registry.getAllTools();
    const checks: ToolCheckResult[] = [];

    for (const tool of tools) {
      const result = await this.checkTool(tool, preferredRuntime);
      checks.push(result);
    }

    const passed = checks.filter((c) => c.installed).length;
    const failed = checks.length - passed;

    return {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      checks,
      summary: {
        total: checks.length,
        passed,
        failed,
      },
    };
  }
}
