/**
 * Prompt Corpus Tester - Structured response validation without semantic assertions
 *
 * Tests LLM responses by validating STRUCTURE, not CONTENT.
 * This approach provides strong signal without flaky semantic checks.
 *
 * Key insight: We can't assert "the answer is correct" but we CAN assert:
 * - JSON is valid when JSON was requested
 * - Code blocks exist when code was requested
 * - Lists have the requested number of items
 * - Tables have proper markdown structure
 * - Responses are non-empty and timely
 */

import type { Page } from 'playwright';
import type { Issue } from '../types.js';

export interface PromptCorpusConfig {
  /** CSS selector for chat input */
  inputSelector: string;
  /** CSS selector for response container */
  responseSelector: string;
  /** Timeout for response in milliseconds */
  responseTimeoutMs: number;
  /** Custom test cases */
  testCases?: PromptTestCase[];
}

export interface PromptTestCase {
  /** Unique identifier for the test */
  id: string;
  /** The prompt to send */
  prompt: string;
  /** Expected response format */
  expectedFormat: ResponseFormat;
  /** Description of what this tests */
  description: string;
  /** Optional custom validator function */
  customValidator?: (response: string) => ValidationResult;
}

export type ResponseFormat =
  | 'any' // Just needs to be non-empty
  | 'json' // Must be valid JSON
  | 'code-block' // Must contain fenced code block
  | 'numbered-list' // Must contain numbered list
  | 'bullet-list' // Must contain bullet list
  | 'table' // Must contain markdown table
  | 'paragraphs' // Must contain multiple paragraphs
  | 'single-line' // Should be a concise single line
  | 'refusal'; // Should indicate refusal/inability

interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface PromptTestResult {
  testCase: PromptTestCase;
  passed: boolean;
  responseTimeMs: number;
  response: string;
  validationResult: ValidationResult;
  issues: Issue[];
}

// Built-in test cases covering common LLM response formats
const BUILTIN_TEST_CASES: PromptTestCase[] = [
  {
    id: 'json-object',
    prompt: 'Return a JSON object with fields "name" (string) and "age" (number). Only output the JSON, no explanation.',
    expectedFormat: 'json',
    description: 'Tests that model can output valid JSON when requested',
  },
  {
    id: 'json-array',
    prompt: 'Return a JSON array with 3 color names as strings. Only output the JSON array, no explanation.',
    expectedFormat: 'json',
    description: 'Tests JSON array output',
  },
  {
    id: 'code-python',
    prompt: 'Write a Python function that adds two numbers. Only output the code.',
    expectedFormat: 'code-block',
    description: 'Tests code block formatting for Python',
  },
  {
    id: 'code-javascript',
    prompt: 'Write a JavaScript function that reverses a string. Only output the code.',
    expectedFormat: 'code-block',
    description: 'Tests code block formatting for JavaScript',
  },
  {
    id: 'numbered-list-3',
    prompt: 'List exactly 3 programming languages, numbered 1-3.',
    expectedFormat: 'numbered-list',
    description: 'Tests numbered list generation',
    customValidator: (response) => {
      const lines = response.split('\n').filter(l => /^\d+[\.\)]\s/.test(l.trim()));
      return {
        valid: lines.length >= 3,
        reason: lines.length < 3 ? `Expected 3 numbered items, found ${lines.length}` : undefined,
      };
    },
  },
  {
    id: 'bullet-list-5',
    prompt: 'List 5 fruits using bullet points.',
    expectedFormat: 'bullet-list',
    description: 'Tests bullet list generation',
    customValidator: (response) => {
      const lines = response.split('\n').filter(l => /^[\-\*\•]\s/.test(l.trim()));
      return {
        valid: lines.length >= 5,
        reason: lines.length < 5 ? `Expected 5 bullet items, found ${lines.length}` : undefined,
      };
    },
  },
  {
    id: 'markdown-table',
    prompt: 'Create a markdown table with 2 columns (Name, Age) and 3 rows of sample data.',
    expectedFormat: 'table',
    description: 'Tests markdown table formatting',
  },
  {
    id: 'multi-paragraph',
    prompt: 'Write a short explanation of what an API is in exactly 2 paragraphs.',
    expectedFormat: 'paragraphs',
    description: 'Tests multi-paragraph prose output',
  },
  {
    id: 'concise-answer',
    prompt: 'What is 2 + 2? Answer with just the number.',
    expectedFormat: 'single-line',
    description: 'Tests ability to give concise responses',
  },
  {
    id: 'basic-response',
    prompt: 'Say hello.',
    expectedFormat: 'any',
    description: 'Basic sanity check - any response is valid',
  },
];

export class PromptCorpusTester {
  private page: Page;
  private config: PromptCorpusConfig;
  private testCases: PromptTestCase[];

  constructor(page: Page, config: Partial<PromptCorpusConfig> = {}) {
    this.page = page;
    this.config = {
      inputSelector: config.inputSelector ?? 'textarea[data-testid*="prompt"], textarea[placeholder*="message" i], textarea',
      responseSelector: config.responseSelector ?? '[data-testid*="message"], [data-testid*="response"], [class*="message"]',
      responseTimeoutMs: config.responseTimeoutMs ?? 30000,
    };
    this.testCases = config.testCases ?? BUILTIN_TEST_CASES;
  }

  /**
   * Run all prompt corpus tests
   */
  async runAll(): Promise<{ results: PromptTestResult[]; summary: CorpusSummary }> {
    const results: PromptTestResult[] = [];

    for (const testCase of this.testCases) {
      const result = await this.runTest(testCase);
      results.push(result);

      // Small delay between tests
      await this.page.waitForTimeout(500);
    }

    const summary = this.summarize(results);
    return { results, summary };
  }

  /**
   * Run a subset of tests by format type
   */
  async runByFormat(format: ResponseFormat): Promise<PromptTestResult[]> {
    const filtered = this.testCases.filter(tc => tc.expectedFormat === format);
    const results: PromptTestResult[] = [];

    for (const testCase of filtered) {
      results.push(await this.runTest(testCase));
    }

    return results;
  }

  /**
   * Run a single test case
   */
  async runTest(testCase: PromptTestCase): Promise<PromptTestResult> {
    const issues: Issue[] = [];
    const startTime = Date.now();
    let response = '';

    try {
      // Find input
      const input = await this.page.$(this.config.inputSelector);
      if (!input) {
        return {
          testCase,
          passed: false,
          responseTimeMs: 0,
          response: '',
          validationResult: { valid: false, reason: 'Input not found' },
          issues: [this.createIssue(testCase, 'Input element not found', 'high')],
        };
      }

      // Get initial response count
      const responsesBefore = await this.page.$$(this.config.responseSelector);
      const countBefore = responsesBefore.length;

      // Send prompt
      await input.fill(testCase.prompt);
      await input.press('Enter');

      // Wait for response
      const responseTimeMs = await this.waitForResponse(countBefore);
      const totalTime = Date.now() - startTime;

      // Get response text
      const responses = await this.page.$$(this.config.responseSelector);
      if (responses.length > countBefore) {
        const lastResponse = responses[responses.length - 1];
        response = await lastResponse.textContent() ?? '';
      }

      // Validate response
      const validationResult = this.validateResponse(response, testCase);

      if (!validationResult.valid) {
        issues.push(this.createIssue(
          testCase,
          validationResult.reason ?? 'Validation failed',
          'medium'
        ));
      }

      return {
        testCase,
        passed: validationResult.valid,
        responseTimeMs: totalTime,
        response: response.slice(0, 1000), // Truncate for storage
        validationResult,
        issues,
      };

    } catch (error) {
      return {
        testCase,
        passed: false,
        responseTimeMs: Date.now() - startTime,
        response,
        validationResult: { valid: false, reason: error instanceof Error ? error.message : String(error) },
        issues: [this.createIssue(testCase, error instanceof Error ? error.message : String(error), 'high')],
      };
    }
  }

  private async waitForResponse(initialCount: number): Promise<number> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.config.responseTimeoutMs) {
      const responses = await this.page.$$(this.config.responseSelector);
      if (responses.length > initialCount) {
        // Check if response has content
        const lastResponse = responses[responses.length - 1];
        const content = await lastResponse.textContent();
        if (content && content.trim().length > 0) {
          // Wait a bit more for streaming to complete
          await this.page.waitForTimeout(1000);
          return Date.now() - startTime;
        }
      }
      await this.page.waitForTimeout(200);
    }

    return Date.now() - startTime;
  }

  private validateResponse(response: string, testCase: PromptTestCase): ValidationResult {
    // First check custom validator if present
    if (testCase.customValidator) {
      return testCase.customValidator(response);
    }

    // Check basic non-empty requirement
    if (!response || response.trim().length === 0) {
      return { valid: false, reason: 'Response is empty' };
    }

    // Validate based on expected format
    switch (testCase.expectedFormat) {
      case 'any':
        return { valid: true };

      case 'json':
        return this.validateJSON(response);

      case 'code-block':
        return this.validateCodeBlock(response);

      case 'numbered-list':
        return this.validateNumberedList(response);

      case 'bullet-list':
        return this.validateBulletList(response);

      case 'table':
        return this.validateTable(response);

      case 'paragraphs':
        return this.validateParagraphs(response);

      case 'single-line':
        return this.validateSingleLine(response);

      case 'refusal':
        return this.validateRefusal(response);

      default:
        return { valid: true };
    }
  }

  private validateJSON(response: string): ValidationResult {
    // Try to extract JSON from response (may have surrounding text)
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) ||
      response.match(/(\{[\s\S]*\})/) ||
      response.match(/(\[[\s\S]*\])/);

    const jsonStr = jsonMatch ? jsonMatch[1] : response;

    try {
      JSON.parse(jsonStr.trim());
      return { valid: true };
    } catch {
      return { valid: false, reason: 'Response does not contain valid JSON' };
    }
  }

  private validateCodeBlock(response: string): ValidationResult {
    // Check for fenced code block
    const hasCodeBlock = /```[\w]*\n[\s\S]+```/.test(response);
    if (hasCodeBlock) {
      return { valid: true };
    }

    // Check for indented code block (4 spaces)
    const hasIndentedCode = /\n {4}\S/.test(response);
    if (hasIndentedCode) {
      return { valid: true };
    }

    return { valid: false, reason: 'Response does not contain a code block' };
  }

  private validateNumberedList(response: string): ValidationResult {
    const numberedLines = response.split('\n').filter(l => /^\s*\d+[\.\)]\s/.test(l));
    if (numberedLines.length >= 2) {
      return { valid: true };
    }
    return { valid: false, reason: `Expected numbered list, found ${numberedLines.length} numbered items` };
  }

  private validateBulletList(response: string): ValidationResult {
    const bulletLines = response.split('\n').filter(l => /^\s*[\-\*\•]\s/.test(l));
    if (bulletLines.length >= 2) {
      return { valid: true };
    }
    return { valid: false, reason: `Expected bullet list, found ${bulletLines.length} bullet items` };
  }

  private validateTable(response: string): ValidationResult {
    // Check for markdown table structure: | column | column |
    const hasTableRows = /\|.*\|/.test(response);
    const hasSeparator = /\|[\s\-:]+\|/.test(response);

    if (hasTableRows && hasSeparator) {
      return { valid: true };
    }
    return { valid: false, reason: 'Response does not contain a properly formatted markdown table' };
  }

  private validateParagraphs(response: string): ValidationResult {
    // Split by double newlines to find paragraphs
    const paragraphs = response.split(/\n\n+/).filter(p => p.trim().length > 20);
    if (paragraphs.length >= 2) {
      return { valid: true };
    }
    return { valid: false, reason: `Expected multiple paragraphs, found ${paragraphs.length}` };
  }

  private validateSingleLine(response: string): ValidationResult {
    const trimmed = response.trim();
    const lines = trimmed.split('\n').filter(l => l.trim().length > 0);

    // Allow up to 3 short lines (some models add context)
    if (lines.length <= 3 && trimmed.length < 200) {
      return { valid: true };
    }
    return { valid: false, reason: `Expected concise single-line response, got ${lines.length} lines / ${trimmed.length} chars` };
  }

  private validateRefusal(response: string): ValidationResult {
    const refusalPatterns = [
      /i can't/i,
      /i cannot/i,
      /i'm unable/i,
      /i am unable/i,
      /sorry/i,
      /apologize/i,
      /not able to/i,
      /won't be able/i,
      /not possible/i,
      /decline/i,
    ];

    for (const pattern of refusalPatterns) {
      if (pattern.test(response)) {
        return { valid: true };
      }
    }
    return { valid: false, reason: 'Expected refusal response but none detected' };
  }

  private createIssue(testCase: PromptTestCase, reason: string, severity: 'low' | 'medium' | 'high'): Issue {
    return {
      id: `prompt-corpus-${testCase.id}-${Date.now()}`,
      severity,
      category: 'llm-prompt-corpus',
      title: `Prompt corpus test failed: ${testCase.id}`,
      description: `${testCase.description}\n\nFailure reason: ${reason}`,
      pageUrl: this.page.url(),
      reproSteps: [
        'Navigate to chat interface',
        `Send prompt: "${testCase.prompt.slice(0, 100)}..."`,
        `Expected format: ${testCase.expectedFormat}`,
        `Validation failed: ${reason}`,
      ],
      selectors: [],
      foundAt: new Date(),
      evidence: {},
    };
  }

  private summarize(results: PromptTestResult[]): CorpusSummary {
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const avgResponseTime = results.reduce((sum, r) => sum + r.responseTimeMs, 0) / results.length;

    const byFormat: Record<string, { passed: number; failed: number }> = {};
    for (const result of results) {
      const format = result.testCase.expectedFormat;
      if (!byFormat[format]) {
        byFormat[format] = { passed: 0, failed: 0 };
      }
      if (result.passed) {
        byFormat[format].passed++;
      } else {
        byFormat[format].failed++;
      }
    }

    return {
      total: results.length,
      passed,
      failed,
      passRate: passed / results.length,
      avgResponseTimeMs: avgResponseTime,
      byFormat,
    };
  }
}

interface CorpusSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  avgResponseTimeMs: number;
  byFormat: Record<string, { passed: number; failed: number }>;
}
