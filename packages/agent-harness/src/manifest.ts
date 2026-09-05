import type { SiliconAgentManifest } from './types.js';

export class ManifestValidator {
  validate(manifest: any): SiliconAgentManifest {
    if (!manifest || manifest.apiVersion !== 'nayvid.io/v1' || manifest.kind !== 'SiliconAgent') {
      throw new Error('Invalid agent manifest: Must specify apiVersion: nayvid.io/v1 and kind: SiliconAgent');
    }
    if (!manifest.metadata?.id) {
      throw new Error('Invalid agent manifest: Missing metadata.id');
    }
    if (!manifest.spec?.level || !manifest.spec?.domain) {
      throw new Error('Invalid agent manifest: Missing spec.level or spec.domain');
    }
    return manifest as SiliconAgentManifest;
  }
}
