/**
 * Console Error Validator - Monitors and validates console output
 *
 * Tracks console errors, warnings, and logs during test runs.
 * Provides filtering, thresholds, and pattern matching.
 */

import type { Page, ConsoleMessage } from 'playwright';
import type { ValidationResult, ValidatorConfig, ValidationError, ValidationWarning } from './types.js';

export interface ConsoleErrorValidatorConfig extends ValidatorConfig {
  /** Maximum allowed error count before failing */
  maxErrors?: number;
  /** Maximum allowed warning count before failing */
  maxWarnings?: number;
  /** Patterns to ignore (regex strings) */
  ignorePatterns?: string[];
  /** Whether to capture info/log messages */
  captureInfo?: boolean;
  /** Known errors that should be treated as warnings */
  knownIssues?: string[];
}

interface ConsoleEntry {
  type: 'error' | 'warning' | 'info' | 'log';
  text: string;
  location?: {
    url: string;
    line: number;
    column: number;
  };
  timestamp: number;
}

export class ConsoleErrorValidator {
  private config: ConsoleErrorValidatorConfig;
  private entries: ConsoleEntry[] = [];
  private ignoreRegexes: RegExp[];

  constructor(config: ConsoleErrorValidatorConfig = {}) {
    this.config = {
      strict: config.strict ?? false,
      maxErrors: config.maxErrors ?? 0,
      maxWarnings: config.maxWarnings ?? 10,
      ignorePatterns: config.ignorePatterns ?? [
        // Common noise patterns
        'favicon.ico',
        'DevTools',
        'React DevTools',
        'Download the React DevTools',
        'Third-party cookie',
        'net::ERR_BLOCKED_BY_CLIENT', // Ad blockers
      ],
      captureInfo: config.captureInfo ?? false,
      knownIssues: config.knownIssues ?? [],
    };

    this.ignoreRegexes = this.config.ignorePatterns!.map(p => new RegExp(p, 'i'));
  }

  /**
   * Attach to a page and start monitoring
   */
  attach(page: Page): void {
    page.on('console', (msg) => this.handleConsoleMessage(msg));
    page.on('pageerror', (error) => this.handlePageError(error));
  }

  /**
   * Clear captured entries
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Get current validation result
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const consoleErrors = this.entries.filter(e => e.type === 'error');
    const consoleWarnings = this.entries.filter(e => e.type === 'warning');

    // Check error count
    if (consoleErrors.length > this.config.maxErrors!) {
      for (const entry of consoleErrors) {
        // Check if it's a known issue
        const isKnown = this.config.knownIssues!.some(k => entry.text.includes(k));

        if (isKnown) {
          warnings.push({
            code: 'KNOWN_CONSOLE_ERROR',
            message: entry.text.slice(0, 200),
            suggestion: 'This is a known issue that should be addressed',
          });
        } else {
          errors.push({
            code: 'CONSOLE_ERROR',
            message: entry.text.slice(0, 200),
            line: entry.location?.line,
            context: entry.location?.url,
          });
        }
      }
    }

    // Check warning count
    if (this.config.strict && consoleWarnings.length > this.config.maxWarnings!) {
      for (const entry of consoleWarnings) {
        warnings.push({
          code: 'CONSOLE_WARNING',
          message: entry.text.slice(0, 200),
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        totalErrors: consoleErrors.length,
        totalWarnings: consoleWarnings.length,
        totalInfo: this.entries.filter(e => e.type === 'info' || e.type === 'log').length,
        entries: this.entries.slice(0, 50), // Limit for storage
      },
    };
  }

  /**
   * Get all captured entries
   */
  getEntries(): ConsoleEntry[] {
    return [...this.entries];
  }

  /**
   * Get error count
   */
  getErrorCount(): number {
    return this.entries.filter(e => e.type === 'error').length;
  }

  private handleConsoleMessage(msg: ConsoleMessage): void {
    const text = msg.text();

    // Check ignore patterns
    if (this.shouldIgnore(text)) {
      return;
    }

    const type = this.mapConsoleType(msg.type());

    // Skip info/log if not capturing
    if (!this.config.captureInfo && (type === 'info' || type === 'log')) {
      return;
    }

    const location = msg.location();

    this.entries.push({
      type,
      text,
      location: location.url ? {
        url: location.url,
        line: location.lineNumber,
        column: location.columnNumber,
      } : undefined,
      timestamp: Date.now(),
    });
  }

  private handlePageError(error: Error): void {
    const text = error.message;

    if (this.shouldIgnore(text)) {
      return;
    }

    this.entries.push({
      type: 'error',
      text: `Uncaught: ${text}`,
      timestamp: Date.now(),
    });
  }

  private shouldIgnore(text: string): boolean {
    return this.ignoreRegexes.some(regex => regex.test(text));
  }

  private mapConsoleType(type: string): ConsoleEntry['type'] {
    switch (type) {
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      default:
        return 'log';
    }
  }
}
