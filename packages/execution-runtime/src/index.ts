import type { ExecutionBackend, RuntimeType } from './types.js';
import { NativeWindowsBackend, WslBackend, LinuxBackend, DockerBackend } from './backends.js';

export class ExecutionRuntimeManager {
  private backends: Map<RuntimeType, ExecutionBackend> = new Map();

  constructor() {
    this.backends.set('native-windows', new NativeWindowsBackend());
    this.backends.set('wsl2', new WslBackend());
    this.backends.set('linux', new LinuxBackend());
    this.backends.set('docker', new DockerBackend());
  }

  getBackend(type: RuntimeType): ExecutionBackend {
    if (type === 'auto') {
      if (process.platform === 'win32') {
        return this.backends.get('native-windows')!;
      }
      return this.backends.get('linux')!;
    }
    const backend = this.backends.get(type);
    if (!backend) {
      throw new Error(`Execution backend '${type}' is not registered.`);
    }
    return backend;
  }

  async resolveBestBackend(preferred: RuntimeType = 'auto'): Promise<ExecutionBackend> {
    if (preferred !== 'auto') {
      const selected = this.getBackend(preferred);
      if (await selected.isAvailable()) {
        return selected;
      }
    }

    if (process.platform === 'win32') {
      const nativeWin = this.getBackend('native-windows');
      if (await nativeWin.isAvailable()) return nativeWin;

      const wsl = this.getBackend('wsl2');
      if (await wsl.isAvailable()) return wsl;
    } else if (process.platform === 'linux') {
      const linux = this.getBackend('linux');
      if (await linux.isAvailable()) return linux;
    }

    const docker = this.getBackend('docker');
    if (await docker.isAvailable()) return docker;

    return this.getBackend(process.platform === 'win32' ? 'native-windows' : 'linux');
  }
}

export * from './types.js';
export * from './backends.js';
