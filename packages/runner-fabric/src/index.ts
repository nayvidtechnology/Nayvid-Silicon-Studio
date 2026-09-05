import type {
  RunnerEnvironmentType,
  ComputeResourceRequirements,
  LicenseStatus,
  ExecutionJobSpec,
  JobExecutionResult,
} from './types.js';

export class LicenseBroker {
  private licenses: Map<string, { total: number; inUse: number }> = new Map();

  constructor() {
    this.licenses.set('vcs', { total: 10, inUse: 2 });
    this.licenses.set('design_compiler', { total: 5, inUse: 1 });
    this.licenses.set('innovus', { total: 4, inUse: 0 });
    this.licenses.set('calibre', { total: 8, inUse: 3 });
    this.licenses.set('primetime', { total: 6, inUse: 1 });
  }

  getLicenseStatus(feature: string): LicenseStatus | undefined {
    const lic = this.licenses.get(feature);
    if (!lic) return undefined;
    return {
      feature,
      total: lic.total,
      inUse: lic.inUse,
      available: lic.total - lic.inUse,
    };
  }

  reserveLicenses(features: string[]): boolean {
    for (const f of features) {
      const lic = this.licenses.get(f);
      if (!lic || lic.total - lic.inUse < 1) {
        return false;
      }
    }
    for (const f of features) {
      const lic = this.licenses.get(f)!;
      lic.inUse += 1;
    }
    return true;
  }

  releaseLicenses(features: string[]): void {
    for (const f of features) {
      const lic = this.licenses.get(f);
      if (lic && lic.inUse > 0) {
        lic.inUse -= 1;
      }
    }
  }
}

export class ComputeBroker {
  private licenseBroker = new LicenseBroker();

  getLicenseBroker(): LicenseBroker {
    return this.licenseBroker;
  }

  selectRunnerEnvironment(reqs?: ComputeResourceRequirements, preferred?: RunnerEnvironmentType): RunnerEnvironmentType {
    if (preferred) return preferred;

    if (reqs?.licensesRequired && reqs.licensesRequired.length > 0) {
      return 'slurm';
    }

    if (reqs?.cpus && reqs.cpus > 16) {
      return 'slurm';
    }

    return 'local';
  }

  async executeJob(spec: ExecutionJobSpec): Promise<JobExecutionResult> {
    const env = this.selectRunnerEnvironment(spec.requirements, spec.preferredEnvironment);
    const start = Date.now();

    if (spec.requirements?.licensesRequired) {
      const reserved = this.licenseBroker.reserveLicenses(spec.requirements.licensesRequired);
      if (!reserved) {
        return {
          jobId: spec.id,
          environmentUsed: env,
          exitCode: 1,
          stdout: '',
          stderr: `Insufficient EDA licenses available for required tools: ${spec.requirements.licensesRequired.join(', ')}`,
          durationMs: Date.now() - start,
        };
      }
    }

    try {
      const durationMs = Date.now() - start;
      return {
        jobId: spec.id,
        environmentUsed: env,
        exitCode: 0,
        stdout: `Executed '${spec.command} ${(spec.args || []).join(' ')}' on ${env} environment.`,
        stderr: '',
        durationMs,
      };
    } finally {
      if (spec.requirements?.licensesRequired) {
        this.licenseBroker.releaseLicenses(spec.requirements.licensesRequired);
      }
    }
  }
}

export * from './types.js';
