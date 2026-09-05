import * as fs from 'fs';
import * as path from 'path';
import { sha256, stableJson } from './index.js';

export type PdkDeckKind = 'tech' | 'drc' | 'lvs' | 'erc' | 'pex';

export interface PdkDeckEntry {
  kind: PdkDeckKind;
  path: string;
  digest: string;
  size: number;
}

export interface PdkManifest {
  schemaVersion: 1;
  pdkName: string;
  pdkVersion: string;
  foundry: string;
  processNodeNm: number;
  ruleDecks: PdkDeckEntry[];
  digest: string;
}

export class PdkGovernanceService {
  computeManifest(input: {
    pdkName: string;
    pdkVersion: string;
    foundry: string;
    processNodeNm: number;
    rootDir: string;
    decks: Array<{ kind: PdkDeckKind; relativePath: string }>;
  }): PdkManifest {
    const ruleDecks: PdkDeckEntry[] = [];
    for (const deck of input.decks) {
      const fullPath = path.resolve(input.rootDir, deck.relativePath);
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
        throw new Error(`PDK rule deck file not found: ${deck.relativePath}`);
      }
      const data = fs.readFileSync(fullPath);
      ruleDecks.push({
        kind: deck.kind,
        path: deck.relativePath.replace(/\\/g, '/'),
        digest: sha256(data),
        size: data.length,
      });
    }

    ruleDecks.sort((a, b) => a.path.localeCompare(b.path));
    const base = {
      schemaVersion: 1 as const,
      pdkName: input.pdkName,
      pdkVersion: input.pdkVersion,
      foundry: input.foundry,
      processNodeNm: input.processNodeNm,
      ruleDecks,
    };
    return { ...base, digest: sha256(stableJson(base)) };
  }

  verifyPdk(rootDir: string, manifest: PdkManifest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (manifest.schemaVersion !== 1) errors.push('Unsupported PDK manifest schema');

    for (const deck of manifest.ruleDecks) {
      const fullPath = path.resolve(rootDir, deck.path);
      if (!fs.existsSync(fullPath)) {
        errors.push(`Missing PDK deck file: ${deck.path}`);
        continue;
      }
      const data = fs.readFileSync(fullPath);
      if (data.length !== deck.size) {
        errors.push(`Size mismatch for PDK deck ${deck.path}: expected ${deck.size}, got ${data.length}`);
      }
      if (sha256(data) !== deck.digest) {
        errors.push(`SHA-256 fingerprint mismatch for PDK deck ${deck.path}`);
      }
    }

    const { digest, ...base } = manifest;
    if (sha256(stableJson(base)) !== digest) {
      errors.push('PDK manifest digest mismatch');
    }

    return { valid: errors.length === 0, errors };
  }
}

export type IpFormat = 'liberty' | 'lef' | 'def' | 'sdc' | 'gds' | 'cdl';

export interface IpLibraryEntry {
  format: IpFormat;
  name: string;
  path: string;
  digest: string;
  size: number;
}

export interface IpManifest {
  schemaVersion: 1;
  ipName: string;
  ipVersion: string;
  vendor: string;
  libraries: IpLibraryEntry[];
  digest: string;
}

export class IpManifestService {
  computeManifest(input: {
    ipName: string;
    ipVersion: string;
    vendor: string;
    workspaceRoot: string;
    libraries: Array<{ format: IpFormat; name: string; relativePath: string }>;
  }): IpManifest {
    const libraries: IpLibraryEntry[] = [];
    for (const lib of input.libraries) {
      const fullPath = path.resolve(input.workspaceRoot, lib.relativePath);
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
        throw new Error(`IP library file not found: ${lib.relativePath}`);
      }
      const data = fs.readFileSync(fullPath);
      libraries.push({
        format: lib.format,
        name: lib.name,
        path: lib.relativePath.replace(/\\/g, '/'),
        digest: sha256(data),
        size: data.length,
      });
    }

    libraries.sort((a, b) => a.path.localeCompare(b.path));
    const base = {
      schemaVersion: 1 as const,
      ipName: input.ipName,
      ipVersion: input.ipVersion,
      vendor: input.vendor,
      libraries,
    };
    return { ...base, digest: sha256(stableJson(base)) };
  }

  verifyIp(workspaceRoot: string, manifest: IpManifest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (manifest.schemaVersion !== 1) errors.push('Unsupported IP manifest schema');

    for (const lib of manifest.libraries) {
      const fullPath = path.resolve(workspaceRoot, lib.path);
      if (!fs.existsSync(fullPath)) {
        errors.push(`Missing IP library file: ${lib.path}`);
        continue;
      }
      const data = fs.readFileSync(fullPath);
      if (data.length !== lib.size) {
        errors.push(`Size mismatch for IP library ${lib.path}`);
      }
      if (sha256(data) !== lib.digest) {
        errors.push(`SHA-256 fingerprint mismatch for IP library ${lib.path}`);
      }
    }

    const { digest, ...base } = manifest;
    if (sha256(stableJson(base)) !== digest) {
      errors.push('IP manifest digest mismatch');
    }

    return { valid: errors.length === 0, errors };
  }
}
