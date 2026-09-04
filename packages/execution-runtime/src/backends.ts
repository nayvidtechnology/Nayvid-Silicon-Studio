import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ExecutionBackend, ExecOptions, ExecResult, RuntimeType } from './types.js';

const execFileAsync = promisify(execFile);

export class NativeWindowsBackend implements ExecutionBackend {
  readonly type: RuntimeType = 'native-windows';

  async isAvailable(): Promise<boolean> {
    return process.platform === 'win32';
  }

  toHostPath(guestPath: string): string {
    return guestPath.replace(/\//g, '\\');
  }

  toGuestPath(hostPath: string): string {
    return hostPath.replace(/\\/g, '/');
  }

  async execute(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
    const start = Date.now();
    try {
      const { stdout, stderr } = await execFileAsync(command, args, {
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        timeout: options.timeoutMs,
        windowsHide: true,
      });
      return {
        code: 0,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        code: err.code ?? 1,
        stdout: err.stdout ? err.stdout.toString() : '',
        stderr: err.stderr ? err.stderr.toString() : err.message,
        durationMs: Date.now() - start,
      };
    }
  }
}

export class WslBackend implements ExecutionBackend {
  readonly type: RuntimeType = 'wsl2';
  constructor(private distro: string = 'Ubuntu') {}

  async isAvailable(): Promise<boolean> {
    if (process.platform === 'win32') {
      try {
        const res = await execFileAsync('wsl.exe', ['--list', '--quiet']);
        return res.stdout.includes(this.distro) || res.stdout.trim().length > 0;
      } catch {
        return false;
      }
    }
    return false;
  }

  toHostPath(guestPath: string): string {
    if (guestPath.startsWith('/mnt/c/')) {
      return 'C:\\' + guestPath.slice(7).replace(/\//g, '\\');
    }
    return guestPath;
  }

  toGuestPath(hostPath: string): string {
    if (/^[a-zA-Z]:/.test(hostPath)) {
      const drive = hostPath[0].toLowerCase();
      const rest = hostPath.slice(2).replace(/\\/g, '/');
      return `/mnt/${drive}${rest}`;
    }
    return hostPath.replace(/\\/g, '/');
  }

  async execute(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
    const start = Date.now();
    const guestCwd = options.cwd ? this.toGuestPath(options.cwd) : undefined;
    const wslArgs = ['-d', this.distro];
    if (guestCwd) {
      wslArgs.push('--cd', guestCwd);
    }
    wslArgs.push('--', command, ...args);

    try {
      const { stdout, stderr } = await execFileAsync('wsl.exe', wslArgs, {
        env: options.env ? { ...process.env, ...options.env } : process.env,
        timeout: options.timeoutMs,
      });
      return {
        code: 0,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        code: err.code ?? 1,
        stdout: err.stdout ? err.stdout.toString() : '',
        stderr: err.stderr ? err.stderr.toString() : err.message,
        durationMs: Date.now() - start,
      };
    }
  }
}

export class LinuxBackend implements ExecutionBackend {
  readonly type: RuntimeType = 'linux';

  async isAvailable(): Promise<boolean> {
    return process.platform === 'linux';
  }

  toHostPath(guestPath: string): string {
    return guestPath;
  }

  toGuestPath(hostPath: string): string {
    return hostPath;
  }

  async execute(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
    const start = Date.now();
    try {
      const { stdout, stderr } = await execFileAsync(command, args, {
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        timeout: options.timeoutMs,
      });
      return {
        code: 0,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        code: err.code ?? 1,
        stdout: err.stdout ? err.stdout.toString() : '',
        stderr: err.stderr ? err.stderr.toString() : err.message,
        durationMs: Date.now() - start,
      };
    }
  }
}

export class DockerBackend implements ExecutionBackend {
  readonly type: RuntimeType = 'docker';
  constructor(private image: string = 'nayvid/eda-suite:latest') {}

  async isAvailable(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('docker', ['--version']);
      return stdout.toLowerCase().includes('docker');
    } catch {
      return false;
    }
  }

  toHostPath(guestPath: string): string {
    return guestPath;
  }

  toGuestPath(hostPath: string): string {
    return hostPath;
  }

  async execute(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
    const start = Date.now();
    const dockerArgs = ['run', '--rm'];
    if (options.cwd) {
      dockerArgs.push('-v', `${options.cwd}:/workspace`, '-w', '/workspace');
    }
    dockerArgs.push(this.image, command, ...args);

    try {
      const { stdout, stderr } = await execFileAsync('docker', dockerArgs, {
        timeout: options.timeoutMs,
      });
      return {
        code: 0,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        code: err.code ?? 1,
        stdout: err.stdout ? err.stdout.toString() : '',
        stderr: err.stderr ? err.stderr.toString() : err.message,
        durationMs: Date.now() - start,
      };
    }
  }
}
