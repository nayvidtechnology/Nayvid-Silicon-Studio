import type { ExecutionBackend, RuntimeType } from './types.js';
import { NativeWindowsBackend, WslBackend, LinuxBackend, DockerBackend } from './backends.js';

export type RuntimeSupportLevel = 'supported' | 'preferred' | 'limited' | 'unsupported';
export type RuntimeSupportMatrix = Partial<Record<RuntimeType, RuntimeSupportLevel>>;

export class ExecutionRuntimeManager {
  private backends: Map<RuntimeType, ExecutionBackend> = new Map();

  constructor(customBackends?: ExecutionBackend[]) {
    const backends = customBackends ?? [
      new NativeWindowsBackend(),
      new WslBackend(),
      new LinuxBackend(),
      new DockerBackend(),
    ];
    for (const backend of backends) this.backends.set(backend.type, backend);
  }

  registerBackend(backend: ExecutionBackend): void {
    this.backends.set(backend.type, backend);
  }

  getBackend(type: RuntimeType): ExecutionBackend {
    if (type === 'auto') {
      const autoType: RuntimeType = process.platform === 'win32' ? 'native-windows' : 'linux';
      const auto = this.backends.get(autoType);
      if (!auto) throw new Error(`Execution backend '${autoType}' is not registered.`);
      return auto;
    }
    const backend = this.backends.get(type);
    if (!backend) throw new Error(`Execution backend '${type}' is not registered.`);
    return backend;
  }

  private platformOrder(): RuntimeType[] {
    if (process.platform === 'win32') return ['native-windows', 'wsl2', 'docker', 'linux'];
    if (process.platform === 'linux') return ['linux', 'docker', 'wsl2', 'native-windows'];
    return ['docker', 'linux', 'native-windows', 'wsl2'];
  }

  async resolveBestBackend(preferred: RuntimeType = 'auto'): Promise<ExecutionBackend> {
    return this.resolveBestBackendFor({}, preferred);
  }

  /**
   * Resolve a backend while respecting a tool's runtime support matrix.
   * Preferred/supported runtimes are tried before limited ones; unsupported
   * runtimes are never selected.
   */
  async resolveBestBackendFor(
    support: RuntimeSupportMatrix,
    preferred: RuntimeType = 'auto'
  ): Promise<ExecutionBackend> {
    const isAllowed = (type: RuntimeType) => (support[type] ?? support.auto ?? 'supported') !== 'unsupported';

    if (preferred !== 'auto' && isAllowed(preferred)) {
      const selected = this.backends.get(preferred);
      if (selected && await selected.isAvailable()) return selected;
    }

    const baseOrder = this.platformOrder().filter((type) => this.backends.has(type) && isAllowed(type));
    const rank = (type: RuntimeType): number => {
      const level = support[type] ?? support.auto ?? 'supported';
      if (level === 'preferred') return 0;
      if (level === 'supported') return 1;
      if (level === 'limited') return 2;
      return 3;
    };

    const candidates = baseOrder
      .map((type, index) => ({ type, index, rank: rank(type) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index);

    for (const candidate of candidates) {
      const backend = this.backends.get(candidate.type)!;
      if (await backend.isAvailable()) return backend;
    }

    throw new Error(`No available execution backend satisfies runtime support: ${JSON.stringify(support)}`);
  }
}

export * from './types.js';
export * from './backends.js';
