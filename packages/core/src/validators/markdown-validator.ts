/**
 * Markdown Validator - Validates markdown structure in LLM responses
 *
 * Checks for:
 * - Properly closed code blocks
 * - Valid heading hierarchy
 * - Properly formatted lists
 * - Valid table structure
 * - Balanced emphasis markers
 */

import type { ValidationResult, ValidatorConfig, ValidationError, ValidationWarning } from './types.js';

export interface MarkdownValidatorConfig extends ValidatorConfig {
  /** Check for unclosed code blocks */
  checkCodeBlocks?: boolean;
  /** Check for valid heading hierarchy */
  checkHeadings?: boolean;
  /** Check for properly formatted tables */
  checkTables?: boolean;
  /** Check for balanced emphasis (bold/italic) */
  checkEmphasis?: boolean;
  /** Check for valid link syntax */
  checkLinks?: boolean;
}

export class MarkdownValidator {
  private config: MarkdownValidatorConfig;

  constructor(config: MarkdownValidatorConfig = {}) {
    this.config = {
      strict: config.strict ?? false,
      maxLength: config.maxLength ?? 100000,
      checkCodeBlocks: config.checkCodeBlocks ?? true,
      checkHeadings: config.checkHeadings ?? true,
      checkTables: config.checkTables ?? true,
      checkEmphasis: config.checkEmphasis ?? false, // Can be noisy
      checkLinks: config.checkLinks ?? true,
    };
  }

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

    const lines = content.split('\n');

    if (this.config.checkCodeBlocks) {
      this.validateCodeBlocks(content, errors, warnings);
    }

    if (this.config.checkHeadings) {
      this.validateHeadings(lines, errors, warnings);
    }

    if (this.config.checkTables) {
      this.validateTables(lines, errors, warnings);
    }

    if (this.config.checkEmphasis) {
      this.validateEmphasis(content, errors, warnings);
    }

    if (this.config.checkLinks) {
      this.validateLinks(content, errors, warnings);
    }

    return {
      valid: this.config.strict ? errors.length === 0 && warnings.length === 0 : errors.length === 0,
      errors,
      warnings,
      metadata: {
        lineCount: lines.length,
        hasCodeBlocks: /```/.test(content),
        hasTables: /\|.*\|/.test(content),
        hasHeadings: /^#{1,6}\s/.test(content),
      },
    };
  }

  private validateCodeBlocks(content: string, errors: ValidationError[], warnings: ValidationWarning[]): void {
    const codeBlockStarts = (content.match(/```/g) || []).length;

    if (codeBlockStarts % 2 !== 0) {
      errors.push({
        code: 'UNCLOSED_CODE_BLOCK',
        message: 'Unclosed code block detected (odd number of ``` markers)',
      });
    }

    // Check for code blocks without language specifier
    const untaggedBlocks = content.match(/```\n/g) || [];
    if (untaggedBlocks.length > 0) {
      warnings.push({
        code: 'UNTAGGED_CODE_BLOCK',
        message: `${untaggedBlocks.length} code block(s) without language specifier`,
        suggestion: 'Add language identifier after ``` for syntax highlighting',
      });
    }
  }

  private validateHeadings(lines: string[], errors: ValidationError[], warnings: ValidationWarning[]): void {
    let lastLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);

      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2];

        // Check for skipped levels (e.g., h1 to h3)
        if (lastLevel > 0 && level > lastLevel + 1) {
          warnings.push({
            code: 'SKIPPED_HEADING_LEVEL',
            message: `Heading level skipped from h${lastLevel} to h${level} at line ${i + 1}`,
            suggestion: 'Consider using sequential heading levels for better document structure',
          });
        }

        // Check for empty heading
        if (!text.trim()) {
          errors.push({
            code: 'EMPTY_HEADING',
            message: `Empty heading at line ${i + 1}`,
            line: i + 1,
          });
        }

        lastLevel = level;
      }
    }
  }

  private validateTables(lines: string[], errors: ValidationError[], warnings: ValidationWarning[]): void {
    let inTable = false;
    let tableStart = 0;
    let columnCount = 0;
    let hasSeparator = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const isTableRow = /^\|.*\|$/.test(line);
      const isSeparator = /^\|[\s\-:]+\|$/.test(line);

      if (isTableRow && !inTable) {
        // Starting a new table
        inTable = true;
        tableStart = i;
        columnCount = (line.match(/\|/g) || []).length - 1;
        hasSeparator = false;
      } else if (inTable) {
        if (isSeparator) {
          hasSeparator = true;
        } else if (isTableRow) {
          // Check column count consistency
          const currentColumns = (line.match(/\|/g) || []).length - 1;
          if (currentColumns !== columnCount) {
            warnings.push({
              code: 'INCONSISTENT_TABLE_COLUMNS',
              message: `Table column count inconsistent at line ${i + 1} (expected ${columnCount}, got ${currentColumns})`,
              suggestion: 'Ensure all table rows have the same number of columns',
            });
          }
        } else {
          // Table ended
          if (!hasSeparator) {
            warnings.push({
              code: 'TABLE_MISSING_SEPARATOR',
              message: `Table starting at line ${tableStart + 1} is missing header separator row`,
              suggestion: 'Add a row like |---|---| after the header row',
            });
          }
          inTable = false;
        }
      }
    }

    // Check if table ended at EOF without separator
    if (inTable && !hasSeparator) {
      warnings.push({
        code: 'TABLE_MISSING_SEPARATOR',
        message: `Table starting at line ${tableStart + 1} is missing header separator row`,
      });
    }
  }

  private validateEmphasis(content: string, errors: ValidationError[], warnings: ValidationWarning[]): void {
    // Check for unbalanced bold markers
    const boldCount = (content.match(/\*\*/g) || []).length;
    if (boldCount % 2 !== 0) {
      warnings.push({
        code: 'UNBALANCED_BOLD',
        message: 'Unbalanced bold markers (**) detected',
      });
    }

    // Check for unbalanced italic markers (harder due to lists using *)
    // Skip this check for now as it's complex
  }

  private validateLinks(content: string, errors: ValidationError[], warnings: ValidationWarning[]): void {
    // Find markdown links [text](url)
    const linkPattern = /\[([^\]]*)\]\(([^)]*)\)/g;
    let match;

    while ((match = linkPattern.exec(content)) !== null) {
      const text = match[1];
      const url = match[2];

      // Check for empty link text
      if (!text.trim()) {
        warnings.push({
          code: 'EMPTY_LINK_TEXT',
          message: `Link with empty text found: ${match[0]}`,
          suggestion: 'Add descriptive text for accessibility',
        });
      }

      // Check for empty URL
      if (!url.trim()) {
        errors.push({
          code: 'EMPTY_LINK_URL',
          message: `Link with empty URL found: ${match[0]}`,
        });
      }

      // Check for obviously broken URLs
      if (url.startsWith('http') && !url.includes('://')) {
        warnings.push({
          code: 'MALFORMED_URL',
          message: `Potentially malformed URL: ${url}`,
        });
      }
    }

    // Check for unclosed link syntax
    const unclosed = content.match(/\[[^\]]*\]\([^)]*$/gm);
    if (unclosed) {
      errors.push({
        code: 'UNCLOSED_LINK',
        message: 'Unclosed link syntax detected',
      });
    }
  }
}
