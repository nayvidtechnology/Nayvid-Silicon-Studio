import type { DataClassification } from './types.js';

export interface SanitizedContext {
  originalClassification: DataClassification;
  isCloudAllowed: boolean;
  sanitizedPrompt: string;
}

export class ContextFirewall {
  sanitizeForCloud(rawPrompt: string, classification: DataClassification): SanitizedContext {
    if (classification === 'PDK_RESTRICTED' || classification === 'RTL_SECRET' || classification === 'NETLIST_SECRET') {
      let sanitized = rawPrompt
        .replace(/\b(TSMC|GF|INTEL|SAMSUNG)_[A-Z0-9_]+/gi, '[SANITIZED_CELL]')
        .replace(/always_ff\s*@[\s\S]*?end/g, '[SANITIZED_SEQUENTIAL_BLOCK]')
        .replace(/always_comb\s*begin[\s\S]*?end/g, '[SANITIZED_COMBINATIONAL_BLOCK]')
        .replace(/module\s+[a-zA-Z0-9_]+\s*\(/g, 'module [SANITIZED_MODULE_NAME] (');

      return {
        originalClassification: classification,
        isCloudAllowed: true,
        sanitizedPrompt: sanitized,
      };
    }

    return {
      originalClassification: classification,
      isCloudAllowed: true,
      sanitizedPrompt: rawPrompt,
    };
  }
}
