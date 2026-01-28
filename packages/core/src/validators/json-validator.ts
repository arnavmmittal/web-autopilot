/**
 * JSON Validator - Validates JSON structure in LLM responses
 *
 * Features:
 * - Extracts JSON from markdown code blocks
 * - Validates against optional JSON schema
 * - Provides detailed parse error messages
 * - Handles common LLM JSON quirks (trailing commas, comments)
 */

import type { ValidationResult, ValidatorConfig, ValidationError, ValidationWarning } from './types.js';

export interface JsonValidatorConfig extends ValidatorConfig {
  /** Expected JSON schema (simplified subset) */
  expectedFields?: string[];
  /** Whether to allow JSON within markdown code blocks */
  allowCodeBlocks?: boolean;
  /** Whether to try fixing common JSON errors */
  attemptRepair?: boolean;
}

export class JsonValidator {
  private config: JsonValidatorConfig;

  constructor(config: JsonValidatorConfig = {}) {
    this.config = {
      strict: config.strict ?? false,
      maxLength: config.maxLength ?? 100000,
      expectedFields: config.expectedFields,
      allowCodeBlocks: config.allowCodeBlocks ?? true,
      attemptRepair: config.attemptRepair ?? true,
    };
  }

  /**
   * Validate a string as JSON
   */
  validate(content: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!content || content.trim().length === 0) {
      return {
        valid: false,
        errors: [{ code: 'EMPTY_CONTENT', message: 'Content is empty' }],
        warnings: [],
      };
    }

    if (content.length > this.config.maxLength!) {
      return {
        valid: false,
        errors: [{
          code: 'CONTENT_TOO_LONG',
          message: `Content exceeds maximum length of ${this.config.maxLength} characters`,
        }],
        warnings: [],
      };
    }

    // Try to extract JSON from the content
    let jsonStr = this.extractJson(content);
    let extracted = jsonStr !== content;

    if (extracted) {
      warnings.push({
        code: 'JSON_EXTRACTED',
        message: 'JSON was extracted from surrounding content',
        suggestion: 'Consider requesting raw JSON output without explanation',
      });
    }

    // Attempt to parse
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseError) {
      // Try repair if enabled
      if (this.config.attemptRepair) {
        const repaired = this.attemptRepair(jsonStr);
        if (repaired !== jsonStr) {
          try {
            parsed = JSON.parse(repaired);
            warnings.push({
              code: 'JSON_REPAIRED',
              message: 'JSON had syntax errors that were auto-repaired',
              suggestion: 'Original JSON had issues like trailing commas or missing quotes',
            });
          } catch {
            // Repair didn't help
          }
        }
      }

      if (!parsed) {
        const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
        const lineMatch = errorMessage.match(/position (\d+)/);
        const position = lineMatch ? parseInt(lineMatch[1]) : undefined;

        errors.push({
          code: 'INVALID_JSON',
          message: `Invalid JSON: ${errorMessage}`,
          context: position ? jsonStr.slice(Math.max(0, position - 20), position + 20) : undefined,
        });

        return { valid: false, errors, warnings };
      }
    }

    // Validate expected fields
    if (this.config.expectedFields && typeof parsed === 'object' && parsed !== null) {
      const obj = parsed as Record<string, unknown>;
      for (const field of this.config.expectedFields) {
        if (!(field in obj)) {
          if (this.config.strict) {
            errors.push({
              code: 'MISSING_FIELD',
              message: `Expected field "${field}" is missing`,
            });
          } else {
            warnings.push({
              code: 'MISSING_FIELD',
              message: `Expected field "${field}" is missing`,
            });
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        type: Array.isArray(parsed) ? 'array' : typeof parsed,
        extracted,
        fieldCount: typeof parsed === 'object' && parsed !== null ? Object.keys(parsed).length : undefined,
      },
    };
  }

  /**
   * Extract JSON from content that may contain markdown or prose
   */
  private extractJson(content: string): string {
    // First try to find JSON in code blocks
    if (this.config.allowCodeBlocks) {
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        return codeBlockMatch[1].trim();
      }
    }

    // Try to find object or array
    const objectMatch = content.match(/(\{[\s\S]*\})/);
    const arrayMatch = content.match(/(\[[\s\S]*\])/);

    // Return the one that appears first
    if (objectMatch && arrayMatch) {
      return content.indexOf(objectMatch[0]) < content.indexOf(arrayMatch[0])
        ? objectMatch[1]
        : arrayMatch[1];
    }

    return objectMatch?.[1] || arrayMatch?.[1] || content.trim();
  }

  /**
   * Attempt to repair common JSON errors
   */
  private attemptRepair(jsonStr: string): string {
    let repaired = jsonStr;

    // Remove trailing commas before } or ]
    repaired = repaired.replace(/,\s*([\}\]])/g, '$1');

    // Remove JavaScript-style comments
    repaired = repaired.replace(/\/\/.*$/gm, '');
    repaired = repaired.replace(/\/\*[\s\S]*?\*\//g, '');

    // Fix unquoted keys (simple cases)
    repaired = repaired.replace(/(\{|\,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

    // Fix single quotes to double quotes
    repaired = repaired.replace(/'/g, '"');

    return repaired;
  }
}
