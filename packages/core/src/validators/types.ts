/**
 * Common types for validators
 */

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  metadata?: Record<string, unknown>;
}

export interface ValidationError {
  code: string;
  message: string;
  line?: number;
  column?: number;
  context?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  suggestion?: string;
}

export interface ValidatorConfig {
  /** Whether to treat warnings as errors */
  strict?: boolean;
  /** Maximum content length to validate */
  maxLength?: number;
}
