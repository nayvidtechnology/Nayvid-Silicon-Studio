import { ExecutionRuntimeManager } from '@nayvid/execution-runtime';
import { NayvidDoctorService } from '@nayvid/tool-registry';
import { AgentToolGateway } from '@nayvid/agent-tools';

export class DesktopBridge {
  private runtimeManager = new ExecutionRuntimeManager();
  private doctor = new NayvidDoctorService();
  private gateway = new AgentToolGateway();

  async handleIPC(channel: string, payload: any): Promise<any> {
    switch (channel) {
      case 'nayvid:doctor':
        return await this.doctor.runDiagnostics(payload?.runtime ?? 'auto');
      case 'nayvid:exec':
        const backend = await this.runtimeManager.resolveBestBackend(payload?.runtime ?? 'auto');
        return await backend.execute(payload.command, payload.args || [], payload.options);
      case 'navi:tool':
        return await this.gateway.executeTool(payload.name, payload.args || {});
      default:
        throw new Error(`Unknown desktop IPC channel: ${channel}`);
    }
  }
}

export function startDesktopApp(): void {
  console.log('Nayvid Silicon Studio Electron Main process initialized.');
}
