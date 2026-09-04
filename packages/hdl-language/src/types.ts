import type { DesignGraph, SourceLocation } from '@nayvid/design-ir';

export interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  code?: string;
  message: string;
  location: SourceLocation;
}

export interface LintResult {
  file: string;
  diagnostics: Diagnostic[];
}

export interface LanguageAdapter {
  name: string;
  parseToIR(files: string[], topModule?: string): Promise<DesignGraph>;
  runLint(files: string[]): Promise<LintResult[]>;
}
