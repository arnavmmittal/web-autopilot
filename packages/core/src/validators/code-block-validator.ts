/**
 * Code Block Validator - Validates code blocks in LLM responses
 *
 * Checks for:
 * - Properly fenced code blocks
 * - Language specifiers present
 * - Basic syntax validation for common languages
 * - Balanced brackets/braces/parens
 */

import type { ValidationResult, ValidatorConfig, ValidationError, ValidationWarning } from './types.js';

export interface CodeBlockValidatorConfig extends ValidatorConfig {
  /** Languages to perform syntax validation on */
  validateLanguages?: string[];
  /** Require language specifier on code blocks */
  requireLanguage?: boolean;
  /** Check for balanced brackets */
  checkBrackets?: boolean;
}

export class CodeBlockValidator {
  private config: CodeBlockValidatorConfig;

  constructor(config: CodeBlockValidatorConfig = {}) {
    this.config = {
      strict: config.strict ?? false,
      maxLength: config.maxLength ?? 100000,
      validateLanguages: config.validateLanguages ?? ['javascript', 'typescript', 'python', 'json'],
      requireLanguage: config.requireLanguage ?? false,
      checkBrackets: config.checkBrackets ?? true,
    };
  }

  validate(content: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const codeBlocks = this.extractCodeBlocks(content);

    if (codeBlocks.length === 0) {
      return {
        valid: false,
        errors: [{ code: 'NO_CODE_BLOCKS', message: 'No code blocks found in content' }],
        warnings: [],
      };
    }

    for (const block of codeBlocks) {
      // Check language specifier
      if (!block.language) {
        if (this.config.requireLanguage) {
          errors.push({
            code: 'MISSING_LANGUAGE',
            message: 'Code block is missing language specifier',
            context: block.code.slice(0, 50),
          });
        } else {
          warnings.push({
            code: 'MISSING_LANGUAGE',
            message: 'Code block is missing language specifier',
            suggestion: 'Add language identifier after ``` for syntax highlighting',
          });
        }
      }

      // Check for empty code block
      if (!block.code.trim()) {
        errors.push({
          code: 'EMPTY_CODE_BLOCK',
          message: 'Code block is empty',
        });
        continue;
      }

      // Validate brackets if enabled
      if (this.config.checkBrackets) {
        const bracketResult = this.validateBrackets(block.code);
        if (!bracketResult.valid) {
          errors.push({
            code: 'UNBALANCED_BRACKETS',
            message: bracketResult.message!,
            context: block.code.slice(0, 100),
          });
        }
      }

      // Language-specific validation
      if (block.language && this.config.validateLanguages?.includes(block.language)) {
        const langResult = this.validateLanguage(block.code, block.language);
        errors.push(...langResult.errors);
        warnings.push(...langResult.warnings);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        blockCount: codeBlocks.length,
        languages: [...new Set(codeBlocks.map(b => b.language).filter(Boolean))],
        totalLines: codeBlocks.reduce((sum, b) => sum + b.code.split('\n').length, 0),
      },
    };
  }

  private extractCodeBlocks(content: string): { language: string | null; code: string }[] {
    const blocks: { language: string | null; code: string }[] = [];
    const pattern = /```(\w*)\n([\s\S]*?)```/g;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      blocks.push({
        language: match[1] || null,
        code: match[2],
      });
    }

    return blocks;
  }

  private validateBrackets(code: string): { valid: boolean; message?: string } {
    const stack: string[] = [];
    const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    const opening = new Set(['(', '[', '{']);
    const closing = new Set([')', ']', '}']);

    // Simple state to skip strings and comments
    let inString = false;
    let stringChar = '';
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      const nextChar = code[i + 1];
      const prevChar = code[i - 1];

      // Handle newlines
      if (char === '\n') {
        inLineComment = false;
        continue;
      }

      // Handle comments
      if (!inString && !inBlockComment && char === '/' && nextChar === '/') {
        inLineComment = true;
        continue;
      }
      if (!inString && !inLineComment && char === '/' && nextChar === '*') {
        inBlockComment = true;
        continue;
      }
      if (inBlockComment && char === '*' && nextChar === '/') {
        inBlockComment = false;
        i++; // Skip next char
        continue;
      }
      if (inLineComment || inBlockComment) continue;

      // Handle strings
      if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
        continue;
      }
      if (inString) continue;

      // Check brackets
      if (opening.has(char)) {
        stack.push(char);
      } else if (closing.has(char)) {
        if (stack.length === 0) {
          return { valid: false, message: `Unexpected closing bracket '${char}'` };
        }
        const last = stack.pop()!;
        if (pairs[last] !== char) {
          return { valid: false, message: `Mismatched brackets: expected '${pairs[last]}' but found '${char}'` };
        }
      }
    }

    if (stack.length > 0) {
      return { valid: false, message: `Unclosed bracket(s): ${stack.map(b => pairs[b]).join(', ')}` };
    }

    return { valid: true };
  }

  private validateLanguage(code: string, language: string): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    switch (language.toLowerCase()) {
      case 'json':
        try {
          JSON.parse(code);
        } catch (e) {
          errors.push({
            code: 'INVALID_JSON',
            message: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
        break;

      case 'javascript':
      case 'typescript':
      case 'js':
      case 'ts':
        // Check for common issues
        if (code.includes('console.log(') && !code.includes('console.log(')) {
          // This is a placeholder - in reality we'd use a real parser
        }

        // Check for obvious syntax errors
        const jsPatterns = [
          { pattern: /\bfunction\s*\(\s*\)\s*{[^}]*$/, message: 'Possibly unclosed function' },
          { pattern: /=>\s*{[^}]*$/, message: 'Possibly unclosed arrow function' },
          { pattern: /if\s*\([^)]*\)\s*{[^}]*$/, message: 'Possibly unclosed if block' },
        ];

        for (const { pattern, message } of jsPatterns) {
          if (pattern.test(code)) {
            warnings.push({ code: 'POSSIBLE_SYNTAX_ERROR', message });
          }
        }
        break;

      case 'python':
      case 'py':
        // Check for inconsistent indentation
        const lines = code.split('\n').filter(l => l.trim());
        let prevIndent = 0;
        let usesSpaces = false;
        let usesTabs = false;

        for (const line of lines) {
          const indent = line.match(/^(\s*)/)?.[1] || '';
          if (indent.includes(' ')) usesSpaces = true;
          if (indent.includes('\t')) usesTabs = true;
        }

        if (usesSpaces && usesTabs) {
          warnings.push({
            code: 'MIXED_INDENTATION',
            message: 'Python code mixes tabs and spaces for indentation',
            suggestion: 'Use consistent indentation (preferably 4 spaces)',
          });
        }
        break;
    }

    return { errors, warnings };
  }
}
