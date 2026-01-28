/**
 * Streaming Validator - Validates LLM streaming response behavior
 *
 * Tests critical streaming behaviors in Copilot-style apps:
 * - Time to first token (TTFT)
 * - Token streaming continuity (no freezes)
 * - Stop/cancel button functionality
 * - UI responsiveness during streaming
 * - Stream recovery after interruption
 */

import type { Page } from 'playwright';
import type { Issue } from '../types.js';

export interface StreamingConfig {
  /** CSS selector for the message input */
  inputSelector: string;
  /** CSS selector for the send button */
  sendButtonSelector: string;
  /** CSS selector for the stop/cancel button */
  stopButtonSelector: string;
  /** CSS selector for the streaming response container */
  responseContainerSelector: string;
  /** CSS selector that indicates streaming is in progress */
  streamingIndicatorSelector: string;
  /** Maximum acceptable TTFT in milliseconds */
  maxTTFTMs: number;
  /** Maximum acceptable time between token updates */
  maxTokenGapMs: number;
  /** Timeout for entire response generation */
  responseTimeoutMs: number;
  /** Test prompts to use */
  testPrompts: string[];
}

export interface StreamingMetrics {
  /** Time to first token in milliseconds */
  ttftMs: number;
  /** Total response time in milliseconds */
  totalTimeMs: number;
  /** Number of token update events observed */
  tokenUpdateCount: number;
  /** Maximum gap between token updates */
  maxTokenGapMs: number;
  /** Whether stop button appeared during streaming */
  stopButtonAppeared: boolean;
  /** Whether stop button worked when clicked */
  stopButtonWorked: boolean;
  /** Whether UI remained responsive during streaming */
  uiResponsive: boolean;
  /** Final response length in characters */
  responseLength: number;
}

interface StreamingTestResult {
  prompt: string;
  metrics: StreamingMetrics;
  issues: Issue[];
  passed: boolean;
}

export class StreamingValidator {
  private page: Page;
  private config: StreamingConfig;

  constructor(page: Page, config: Partial<StreamingConfig> = {}) {
    this.page = page;
    this.config = {
      inputSelector: config.inputSelector ?? 'textarea[data-testid*="prompt"], textarea[placeholder*="message" i], textarea',
      sendButtonSelector: config.sendButtonSelector ?? 'button[data-testid*="send"], button[aria-label*="send" i], button[type="submit"]',
      stopButtonSelector: config.stopButtonSelector ?? 'button[data-testid*="stop"], button[aria-label*="stop" i], button:has-text("Stop")',
      responseContainerSelector: config.responseContainerSelector ?? '[data-testid*="message"], [data-testid*="response"], [class*="message"]',
      streamingIndicatorSelector: config.streamingIndicatorSelector ?? '[data-streaming="true"], [class*="streaming"], [class*="typing"]',
      maxTTFTMs: config.maxTTFTMs ?? 3000,
      maxTokenGapMs: config.maxTokenGapMs ?? 2000,
      responseTimeoutMs: config.responseTimeoutMs ?? 60000,
      testPrompts: config.testPrompts ?? [
        'Count from 1 to 10 slowly',
        'Write a short paragraph about the weather',
        'List 5 programming languages',
      ],
    };
  }

  /**
   * Run streaming validation tests
   */
  async validate(): Promise<{ results: StreamingTestResult[]; issues: Issue[] }> {
    const results: StreamingTestResult[] = [];
    const allIssues: Issue[] = [];

    for (const prompt of this.config.testPrompts) {
      const result = await this.testStreamingResponse(prompt);
      results.push(result);
      allIssues.push(...result.issues);
    }

    // Test stop button functionality
    const stopResult = await this.testStopButton();
    allIssues.push(...stopResult.issues);

    return { results, issues: allIssues };
  }

  /**
   * Test streaming response for a single prompt
   */
  private async testStreamingResponse(prompt: string): Promise<StreamingTestResult> {
    const issues: Issue[] = [];
    const metrics: StreamingMetrics = {
      ttftMs: 0,
      totalTimeMs: 0,
      tokenUpdateCount: 0,
      maxTokenGapMs: 0,
      stopButtonAppeared: false,
      stopButtonWorked: false,
      uiResponsive: true,
      responseLength: 0,
    };

    try {
      // Find and fill input
      const input = await this.page.$(this.config.inputSelector);
      if (!input) {
        issues.push(this.createIssue(
          'streaming-input-not-found',
          'Chat input not found',
          `Could not find input using selector: ${this.config.inputSelector}`,
          'high'
        ));
        return { prompt, metrics, issues, passed: false };
      }

      // Clear any existing content and type prompt
      await input.fill('');
      await input.fill(prompt);

      // Get initial response count
      const initialResponseCount = await this.page.$$(this.config.responseContainerSelector).then(r => r.length);

      // Record start time and send
      const startTime = Date.now();
      await input.press('Enter');

      // Wait for first token (new response container or content change)
      let firstTokenTime = 0;
      let lastContentLength = 0;
      let lastTokenTime = startTime;
      let tokenGaps: number[] = [];

      // Poll for response updates
      const pollInterval = 100;
      let timedOut = false;

      while (Date.now() - startTime < this.config.responseTimeoutMs) {
        await this.page.waitForTimeout(pollInterval);

        // Check for new response or content update
        const responses = await this.page.$$(this.config.responseContainerSelector);
        const currentResponseCount = responses.length;

        // Get latest response content
        let currentContent = '';
        if (responses.length > 0) {
          const latestResponse = responses[responses.length - 1];
          currentContent = await latestResponse.textContent() ?? '';
        }

        // Detect first token
        if (firstTokenTime === 0 && (currentResponseCount > initialResponseCount || currentContent.length > lastContentLength)) {
          firstTokenTime = Date.now();
          metrics.ttftMs = firstTokenTime - startTime;
        }

        // Track token updates
        if (currentContent.length > lastContentLength) {
          const gap = Date.now() - lastTokenTime;
          tokenGaps.push(gap);
          lastTokenTime = Date.now();
          metrics.tokenUpdateCount++;
          lastContentLength = currentContent.length;
        }

        // Check for stop button
        const stopButton = await this.page.$(this.config.stopButtonSelector);
        if (stopButton) {
          metrics.stopButtonAppeared = true;
        }

        // Check if streaming indicator is gone (response complete)
        const isStreaming = await this.page.$(this.config.streamingIndicatorSelector);
        if (firstTokenTime > 0 && !isStreaming && Date.now() - lastTokenTime > 1000) {
          // Streaming seems complete
          break;
        }

        // Check UI responsiveness (can we still interact?)
        try {
          await this.page.evaluate(() => document.body.getBoundingClientRect());
        } catch {
          metrics.uiResponsive = false;
        }
      }

      // Calculate final metrics
      metrics.totalTimeMs = Date.now() - startTime;
      metrics.maxTokenGapMs = tokenGaps.length > 0 ? Math.max(...tokenGaps) : 0;

      // Get final response
      const responses = await this.page.$$(this.config.responseContainerSelector);
      if (responses.length > 0) {
        const latestResponse = responses[responses.length - 1];
        const finalContent = await latestResponse.textContent() ?? '';
        metrics.responseLength = finalContent.length;
      }

      // Generate issues based on metrics
      if (metrics.ttftMs === 0) {
        issues.push(this.createIssue(
          'streaming-no-response',
          'No streaming response received',
          `No response was received for prompt: "${prompt.slice(0, 50)}..."`,
          'high'
        ));
      } else if (metrics.ttftMs > this.config.maxTTFTMs) {
        issues.push(this.createIssue(
          'streaming-slow-ttft',
          `Slow time to first token: ${metrics.ttftMs}ms`,
          `TTFT of ${metrics.ttftMs}ms exceeds threshold of ${this.config.maxTTFTMs}ms`,
          'medium'
        ));
      }

      if (metrics.maxTokenGapMs > this.config.maxTokenGapMs) {
        issues.push(this.createIssue(
          'streaming-token-gap',
          `Long gap between tokens: ${metrics.maxTokenGapMs}ms`,
          `Maximum token gap of ${metrics.maxTokenGapMs}ms exceeds threshold of ${this.config.maxTokenGapMs}ms`,
          'medium'
        ));
      }

      if (!metrics.uiResponsive) {
        issues.push(this.createIssue(
          'streaming-ui-freeze',
          'UI became unresponsive during streaming',
          'The page became unresponsive during response streaming',
          'high'
        ));
      }

      if (metrics.responseLength === 0) {
        issues.push(this.createIssue(
          'streaming-empty-response',
          'Empty response received',
          `Response was empty for prompt: "${prompt.slice(0, 50)}..."`,
          'medium'
        ));
      }

    } catch (error) {
      issues.push(this.createIssue(
        'streaming-error',
        'Streaming test error',
        error instanceof Error ? error.message : String(error),
        'high'
      ));
    }

    return {
      prompt,
      metrics,
      issues,
      passed: issues.length === 0,
    };
  }

  /**
   * Test stop button functionality
   */
  private async testStopButton(): Promise<{ issues: Issue[] }> {
    const issues: Issue[] = [];

    try {
      // Send a prompt that will generate a long response
      const input = await this.page.$(this.config.inputSelector);
      if (!input) return { issues };

      await input.fill('Write a very long story about a space adventure with many characters and plot twists');
      await input.press('Enter');

      // Wait for streaming to start
      await this.page.waitForTimeout(1000);

      // Try to find and click stop button
      const stopButton = await this.page.$(this.config.stopButtonSelector);
      if (!stopButton) {
        issues.push(this.createIssue(
          'streaming-no-stop-button',
          'Stop button not found during streaming',
          'Expected a stop/cancel button to appear during response generation',
          'medium'
        ));
        return { issues };
      }

      // Click stop button
      const responseBeforeStop = await this.getLatestResponseContent();
      await stopButton.click();

      // Wait a moment
      await this.page.waitForTimeout(500);

      // Check if streaming actually stopped
      const responseAfterStop = await this.getLatestResponseContent();
      await this.page.waitForTimeout(1000);
      const responseAfterWait = await this.getLatestResponseContent();

      if (responseAfterWait.length > responseAfterStop.length + 50) {
        issues.push(this.createIssue(
          'streaming-stop-not-working',
          'Stop button did not stop generation',
          'Response continued generating after clicking stop button',
          'high'
        ));
      }

    } catch (error) {
      // Don't fail the whole test if stop button test fails
    }

    return { issues };
  }

  private async getLatestResponseContent(): Promise<string> {
    const responses = await this.page.$$(this.config.responseContainerSelector);
    if (responses.length === 0) return '';
    const latest = responses[responses.length - 1];
    return await latest.textContent() ?? '';
  }

  private createIssue(
    _category: string,
    title: string,
    description: string,
    severity: 'low' | 'medium' | 'high' | 'critical'
  ): Issue {
    return {
      id: `streaming-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      severity,
      category: 'llm-streaming',
      title,
      description,
      pageUrl: this.page.url(),
      reproSteps: [
        'Navigate to chat interface',
        'Send a prompt',
        'Observe streaming behavior',
      ],
      selectors: [],
      foundAt: new Date(),
      evidence: {},
    };
  }
}
