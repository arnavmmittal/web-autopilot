/**
 * Network Injector - Simulate network failures and conditions
 *
 * Uses Playwright's route interception to inject:
 * - Offline conditions
 * - Slow/flaky networks
 * - HTTP error responses (429, 500, 502, 503, 504)
 * - Request timeouts
 * - Partial response failures
 */

import type { Page, Route } from 'playwright';
import type { Issue } from '../types.js';

export interface NetworkCondition {
  /** Condition name */
  name: string;
  /** Latency in milliseconds */
  latencyMs?: number;
  /** Download speed in bytes per second */
  downloadBps?: number;
  /** Upload speed in bytes per second */
  uploadBps?: number;
  /** Packet loss percentage (0-100) */
  packetLoss?: number;
  /** Whether to simulate offline */
  offline?: boolean;
}

export interface NetworkInjectorConfig {
  /** URL patterns to intercept (regex or glob) */
  interceptPatterns: string[];
  /** URL patterns to exclude */
  excludePatterns?: string[];
  /** Whether to log intercepted requests */
  verbose?: boolean;
}

export const PRESET_CONDITIONS: Record<string, NetworkCondition> = {
  offline: {
    name: 'Offline',
    offline: true,
  },
  slow3G: {
    name: 'Slow 3G',
    latencyMs: 400,
    downloadBps: 40000,
    uploadBps: 30000,
  },
  fast3G: {
    name: 'Fast 3G',
    latencyMs: 150,
    downloadBps: 180000,
    uploadBps: 75000,
  },
  flaky: {
    name: 'Flaky Connection',
    latencyMs: 200,
    packetLoss: 30,
  },
  highLatency: {
    name: 'High Latency',
    latencyMs: 2000,
  },
};

interface InjectionResult {
  condition: string;
  url: string;
  method: string;
  injectedStatus?: number;
  injectedLatency?: number;
  timestamp: number;
}

export class NetworkInjector {
  private page: Page;
  private config: NetworkInjectorConfig;
  private active: boolean = false;
  private currentCondition: NetworkCondition | null = null;
  private injectionHistory: InjectionResult[] = [];
  private errorInjectionEnabled: boolean = false;
  private errorStatus: number = 500;

  constructor(page: Page, config: Partial<NetworkInjectorConfig> = {}) {
    this.page = page;
    this.config = {
      interceptPatterns: config.interceptPatterns ?? ['**/*api*/**', '**/*chat*/**', '**/*completion*/**'],
      excludePatterns: config.excludePatterns ?? ['**/*.js', '**/*.css', '**/*.png', '**/*.jpg', '**/*.svg'],
      verbose: config.verbose ?? false,
    };
  }

  /**
   * Apply a network condition
   */
  async applyCondition(condition: NetworkCondition | string): Promise<void> {
    const cond = typeof condition === 'string'
      ? PRESET_CONDITIONS[condition]
      : condition;

    if (!cond) {
      throw new Error(`Unknown network condition: ${condition}`);
    }

    this.currentCondition = cond;

    if (cond.offline) {
      await this.page.context().setOffline(true);
    } else {
      await this.page.context().setOffline(false);
    }

    // Set up route interception for latency/throttling
    if (cond.latencyMs || cond.downloadBps || cond.packetLoss) {
      await this.setupInterception();
    }

    this.active = true;
  }

  /**
   * Enable error injection (returns specified HTTP error for matching requests)
   */
  async enableErrorInjection(status: number = 500): Promise<void> {
    this.errorInjectionEnabled = true;
    this.errorStatus = status;
    await this.setupInterception();
  }

  /**
   * Disable error injection
   */
  disableErrorInjection(): void {
    this.errorInjectionEnabled = false;
  }

  /**
   * Clear all network modifications
   */
  async clear(): Promise<void> {
    this.active = false;
    this.currentCondition = null;
    this.errorInjectionEnabled = false;
    await this.page.context().setOffline(false);
    await this.page.unrouteAll();
  }

  /**
   * Get injection history
   */
  getHistory(): InjectionResult[] {
    return [...this.injectionHistory];
  }

  /**
   * Run a test with network condition and check for proper error handling
   */
  async testErrorHandling(
    action: () => Promise<void>,
    condition: NetworkCondition | string,
    expectedBehavior: {
      shouldShowError?: boolean;
      shouldShowRetry?: boolean;
      shouldNotCrash?: boolean;
      errorSelectors?: string[];
      retrySelectors?: string[];
    }
  ): Promise<{ passed: boolean; issues: Issue[] }> {
    const issues: Issue[] = [];

    try {
      // Apply condition
      await this.applyCondition(condition);

      // Perform action
      await action();

      // Wait for potential error handling
      await this.page.waitForTimeout(2000);

      // Check expectations
      if (expectedBehavior.shouldShowError) {
        const errorVisible = await this.checkForElements(expectedBehavior.errorSelectors ?? [
          '[class*="error"]',
          '[role="alert"]',
          '[data-testid*="error"]',
        ]);

        if (!errorVisible) {
          issues.push(this.createIssue(
            'No error indication shown',
            `Expected error message when ${typeof condition === 'string' ? condition : condition.name}`,
            'high'
          ));
        }
      }

      if (expectedBehavior.shouldShowRetry) {
        const retryVisible = await this.checkForElements(expectedBehavior.retrySelectors ?? [
          'button:has-text("Retry")',
          'button:has-text("Try again")',
          '[data-testid*="retry"]',
        ]);

        if (!retryVisible) {
          issues.push(this.createIssue(
            'No retry option shown',
            `Expected retry button when ${typeof condition === 'string' ? condition : condition.name}`,
            'medium'
          ));
        }
      }

      if (expectedBehavior.shouldNotCrash) {
        const isBlank = await this.page.evaluate(() => {
          return document.body.children.length === 0 ||
            document.body.innerText.trim().length < 10;
        });

        if (isBlank) {
          issues.push(this.createIssue(
            'Page crashed or went blank',
            `Page became unresponsive during ${typeof condition === 'string' ? condition : condition.name}`,
            'critical'
          ));
        }
      }

    } finally {
      await this.clear();
    }

    return {
      passed: issues.length === 0,
      issues,
    };
  }

  /**
   * Run comprehensive reliability tests
   */
  async runReliabilityTests(triggerAction: () => Promise<void>): Promise<{
    results: Array<{ condition: string; passed: boolean; issues: Issue[] }>;
    summary: { total: number; passed: number; failed: number };
  }> {
    const results: Array<{ condition: string; passed: boolean; issues: Issue[] }> = [];

    // Test offline
    const offlineResult = await this.testErrorHandling(
      triggerAction,
      'offline',
      { shouldShowError: true, shouldShowRetry: true, shouldNotCrash: true }
    );
    results.push({ condition: 'offline', ...offlineResult });

    // Test slow network
    const slowResult = await this.testErrorHandling(
      triggerAction,
      'slow3G',
      { shouldNotCrash: true }
    );
    results.push({ condition: 'slow3G', ...slowResult });

    // Test 429 (rate limit)
    await this.enableErrorInjection(429);
    const rateLimitResult = await this.testErrorHandling(
      triggerAction,
      { name: 'Rate Limited' },
      { shouldShowError: true, shouldShowRetry: true, shouldNotCrash: true }
    );
    results.push({ condition: '429 Rate Limit', ...rateLimitResult });
    this.disableErrorInjection();

    // Test 500 (server error)
    await this.enableErrorInjection(500);
    const serverErrorResult = await this.testErrorHandling(
      triggerAction,
      { name: 'Server Error' },
      { shouldShowError: true, shouldNotCrash: true }
    );
    results.push({ condition: '500 Server Error', ...serverErrorResult });
    this.disableErrorInjection();

    // Test 503 (service unavailable)
    await this.enableErrorInjection(503);
    const unavailableResult = await this.testErrorHandling(
      triggerAction,
      { name: 'Service Unavailable' },
      { shouldShowError: true, shouldShowRetry: true, shouldNotCrash: true }
    );
    results.push({ condition: '503 Unavailable', ...unavailableResult });
    this.disableErrorInjection();

    const summary = {
      total: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
    };

    return { results, summary };
  }

  private async setupInterception(): Promise<void> {
    for (const pattern of this.config.interceptPatterns) {
      await this.page.route(pattern, async (route) => {
        await this.handleRoute(route);
      });
    }
  }

  private async handleRoute(route: Route): Promise<void> {
    const request = route.request();
    const url = request.url();

    // Check exclusions
    for (const exclude of this.config.excludePatterns ?? []) {
      if (new RegExp(exclude.replace(/\*/g, '.*')).test(url)) {
        await route.continue();
        return;
      }
    }

    const result: InjectionResult = {
      condition: this.currentCondition?.name ?? 'Error Injection',
      url,
      method: request.method(),
      timestamp: Date.now(),
    };

    // Handle error injection
    if (this.errorInjectionEnabled) {
      result.injectedStatus = this.errorStatus;
      this.injectionHistory.push(result);

      await route.fulfill({
        status: this.errorStatus,
        contentType: 'application/json',
        body: JSON.stringify({
          error: this.getErrorMessage(this.errorStatus),
          status: this.errorStatus,
        }),
      });
      return;
    }

    // Handle latency injection
    if (this.currentCondition?.latencyMs) {
      result.injectedLatency = this.currentCondition.latencyMs;
      await new Promise(resolve => setTimeout(resolve, this.currentCondition!.latencyMs));
    }

    // Handle packet loss
    if (this.currentCondition?.packetLoss) {
      if (Math.random() * 100 < this.currentCondition.packetLoss) {
        result.injectedStatus = 0; // Dropped
        this.injectionHistory.push(result);
        await route.abort('failed');
        return;
      }
    }

    this.injectionHistory.push(result);
    await route.continue();
  }

  private getErrorMessage(status: number): string {
    const messages: Record<number, string> = {
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout',
    };
    return messages[status] ?? 'Error';
  }

  private async checkForElements(selectors: string[]): Promise<boolean> {
    for (const selector of selectors) {
      try {
        const element = await this.page.$(selector);
        if (element && await element.isVisible()) {
          return true;
        }
      } catch {
        // Selector might be invalid
      }
    }
    return false;
  }

  private createIssue(title: string, description: string, severity: Issue['severity']): Issue {
    return {
      id: `reliability-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      severity,
      category: 'llm-reliability',
      title,
      description,
      pageUrl: this.page.url(),
      reproSteps: [
        'Apply network condition',
        'Trigger action',
        'Observe error handling',
      ],
      selectors: [],
      foundAt: new Date(),
      evidence: {},
    };
  }
}
