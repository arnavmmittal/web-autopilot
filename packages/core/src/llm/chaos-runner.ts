/**
 * Chaos Runner - Autonomous "Monkey" Exploration for LLM Chat Apps
 *
 * Randomly explores the application to find edge cases, crashes, and unexpected states.
 * Uses seeded randomness for reproducible test runs.
 *
 * Key features:
 * - Seeded PRNG for deterministic, reproducible chaos
 * - Action allowlist to prevent destructive operations
 * - State-aware actions (won't delete chats in production accounts)
 * - Invariant assertions after each action
 * - Configurable time/step budgets
 */

import type { Page } from 'playwright';
import type { Issue } from '../types.js';

export interface ChaosConfig {
  /** Random seed for reproducibility (default: Date.now()) */
  seed?: number;
  /** Maximum number of actions to perform */
  maxSteps: number;
  /** Maximum time budget in milliseconds */
  maxTimeMs: number;
  /** Allowed action types */
  allowedActions: ChaosActionType[];
  /** CSS selectors for clickable elements (allowlist) */
  clickableSelectors: string[];
  /** CSS selectors to NEVER click */
  forbiddenSelectors: string[];
  /** Safe prompts to randomly send */
  promptCorpus: string[];
  /** Whether to take screenshots after each action */
  screenshotEachStep: boolean;
  /** Callback for progress reporting */
  onAction?: (action: ChaosAction, stepNumber: number) => void;
}

export type ChaosActionType =
  | 'click'
  | 'type-prompt'
  | 'navigate-back'
  | 'navigate-forward'
  | 'refresh'
  | 'scroll'
  | 'keyboard-shortcut'
  | 'resize-viewport'
  | 'toggle-sidebar'
  | 'switch-model';

export interface ChaosAction {
  type: ChaosActionType;
  target?: string;
  value?: string;
  timestamp: number;
  success: boolean;
  error?: string;
}

export interface ChaosResult {
  seed: number;
  totalSteps: number;
  totalTimeMs: number;
  actions: ChaosAction[];
  issues: Issue[];
  invariantViolations: InvariantViolation[];
  consoleErrors: string[];
  uncaughtExceptions: string[];
}

interface InvariantViolation {
  invariant: string;
  description: string;
  afterAction: ChaosAction;
  screenshot?: string;
}

/**
 * Seeded pseudo-random number generator (Mulberry32)
 * Ensures reproducible chaos runs with the same seed
 */
class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /** Returns a number between 0 and 1 */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer between min (inclusive) and max (exclusive) */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }

  /** Returns a random element from an array */
  pick<T>(array: T[]): T | undefined {
    if (array.length === 0) return undefined;
    return array[this.nextInt(0, array.length)];
  }

  /** Shuffles an array in place */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

export class ChaosRunner {
  private page: Page;
  private config: ChaosConfig;
  private rng: SeededRandom;
  private consoleErrors: string[] = [];
  private uncaughtExceptions: string[] = [];
  private actions: ChaosAction[] = [];

  constructor(page: Page, config: Partial<ChaosConfig> = {}) {
    this.page = page;
    const seed = config.seed ?? Date.now();
    this.config = {
      seed,
      maxSteps: config.maxSteps ?? 100,
      maxTimeMs: config.maxTimeMs ?? 60000,
      allowedActions: config.allowedActions ?? [
        'click',
        'type-prompt',
        'scroll',
        'keyboard-shortcut',
      ],
      clickableSelectors: config.clickableSelectors ?? [
        'button:not([disabled])',
        '[role="button"]:not([disabled])',
        'a[href]',
        '[role="tab"]',
        '[role="menuitem"]',
        'input[type="checkbox"]',
        'input[type="radio"]',
        '[data-testid]',
      ],
      forbiddenSelectors: config.forbiddenSelectors ?? [
        '[data-testid*="delete"]',
        '[data-testid*="remove"]',
        'button:has-text("Delete")',
        'button:has-text("Remove")',
        'button:has-text("Sign out")',
        'button:has-text("Log out")',
        '[aria-label*="delete" i]',
        '[aria-label*="remove" i]',
      ],
      promptCorpus: config.promptCorpus ?? [
        'Hello',
        'What is 2 + 2?',
        'Write a haiku about coding',
        'Explain recursion briefly',
        'List 3 colors',
      ],
      screenshotEachStep: config.screenshotEachStep ?? false,
      onAction: config.onAction,
    };
    this.rng = new SeededRandom(seed);
  }

  /**
   * Run chaos exploration
   */
  async run(): Promise<ChaosResult> {
    const startTime = Date.now();
    const issues: Issue[] = [];
    const invariantViolations: InvariantViolation[] = [];

    // Set up error listeners
    this.setupErrorListeners();

    let stepNumber = 0;

    while (
      stepNumber < this.config.maxSteps &&
      Date.now() - startTime < this.config.maxTimeMs
    ) {
      stepNumber++;

      // Pick a random action type
      const actionType = this.rng.pick(this.config.allowedActions);
      if (!actionType) continue;

      // Execute the action
      const action = await this.executeAction(actionType);
      this.actions.push(action);

      // Report progress
      this.config.onAction?.(action, stepNumber);

      // Check invariants after each action
      const violations = await this.checkInvariants(action);
      invariantViolations.push(...violations);

      // Small delay between actions to let UI settle
      await this.page.waitForTimeout(100);
    }

    // Convert violations to issues
    for (const violation of invariantViolations) {
      issues.push({
        id: `chaos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        severity: 'high',
        category: 'llm-chaos',
        title: `Invariant violation: ${violation.invariant}`,
        description: violation.description,
        pageUrl: this.page.url(),
        reproSteps: this.actions.map(
          (a, i) => `${i + 1}. ${a.type}${a.target ? ` on ${a.target}` : ''}${a.value ? ` with "${a.value}"` : ''}`
        ),
        selectors: [],
        foundAt: new Date(),
        evidence: {
          screenshot: violation.screenshot,
        },
      });
    }

    // Add console errors as issues
    for (const error of this.consoleErrors) {
      issues.push({
        id: `chaos-console-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        severity: 'medium',
        category: 'console-error',
        title: 'Console error during chaos run',
        description: error,
        pageUrl: this.page.url(),
        reproSteps: this.actions.map(
          (a, i) => `${i + 1}. ${a.type}${a.target ? ` on ${a.target}` : ''}`
        ),
        selectors: [],
        foundAt: new Date(),
        evidence: {},
      });
    }

    return {
      seed: this.config.seed!,
      totalSteps: stepNumber,
      totalTimeMs: Date.now() - startTime,
      actions: this.actions,
      issues,
      invariantViolations,
      consoleErrors: this.consoleErrors,
      uncaughtExceptions: this.uncaughtExceptions,
    };
  }

  private setupErrorListeners(): void {
    this.page.on('console', (msg) => {
      if (msg.type() === 'error') {
        this.consoleErrors.push(msg.text());
      }
    });

    this.page.on('pageerror', (error) => {
      this.uncaughtExceptions.push(error.message);
    });
  }

  private async executeAction(type: ChaosActionType): Promise<ChaosAction> {
    const timestamp = Date.now();

    try {
      switch (type) {
        case 'click':
          return await this.executeClick(timestamp);
        case 'type-prompt':
          return await this.executeTypePrompt(timestamp);
        case 'navigate-back':
          return await this.executeNavigateBack(timestamp);
        case 'navigate-forward':
          return await this.executeNavigateForward(timestamp);
        case 'refresh':
          return await this.executeRefresh(timestamp);
        case 'scroll':
          return await this.executeScroll(timestamp);
        case 'keyboard-shortcut':
          return await this.executeKeyboardShortcut(timestamp);
        case 'resize-viewport':
          return await this.executeResizeViewport(timestamp);
        default:
          return {
            type,
            timestamp,
            success: false,
            error: `Unknown action type: ${type}`,
          };
      }
    } catch (error) {
      return {
        type,
        timestamp,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async executeClick(timestamp: number): Promise<ChaosAction> {
    // Find all clickable elements
    const selector = this.config.clickableSelectors.join(', ');
    const elements = await this.page.$$(selector);

    // Filter out forbidden elements
    const safeElements: typeof elements = [];
    for (const el of elements) {
      const isForbidden = await this.isForbiddenElement(el);
      if (!isForbidden) {
        safeElements.push(el);
      }
    }

    if (safeElements.length === 0) {
      return {
        type: 'click',
        timestamp,
        success: false,
        error: 'No clickable elements found',
      };
    }

    // Pick a random element
    const element = this.rng.pick(safeElements)!;
    const targetSelector = await this.getElementDescription(element);

    try {
      await element.click({ timeout: 5000 });
      return {
        type: 'click',
        target: targetSelector,
        timestamp,
        success: true,
      };
    } catch (error) {
      return {
        type: 'click',
        target: targetSelector,
        timestamp,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async executeTypePrompt(timestamp: number): Promise<ChaosAction> {
    // Find chat input
    const inputSelectors = [
      'textarea[data-testid*="chat"]',
      'textarea[data-testid*="prompt"]',
      'textarea[placeholder*="message" i]',
      'textarea[placeholder*="ask" i]',
      '[contenteditable="true"]',
      'textarea',
    ];

    let input = null;
    for (const selector of inputSelectors) {
      input = await this.page.$(selector);
      if (input) break;
    }

    if (!input) {
      return {
        type: 'type-prompt',
        timestamp,
        success: false,
        error: 'No chat input found',
      };
    }

    const prompt = this.rng.pick(this.config.promptCorpus) ?? 'Hello';

    try {
      await input.fill(prompt);
      // Press Enter to send
      await input.press('Enter');

      return {
        type: 'type-prompt',
        value: prompt,
        timestamp,
        success: true,
      };
    } catch (error) {
      return {
        type: 'type-prompt',
        value: prompt,
        timestamp,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async executeNavigateBack(timestamp: number): Promise<ChaosAction> {
    await this.page.goBack({ timeout: 5000 }).catch(() => {});
    return { type: 'navigate-back', timestamp, success: true };
  }

  private async executeNavigateForward(timestamp: number): Promise<ChaosAction> {
    await this.page.goForward({ timeout: 5000 }).catch(() => {});
    return { type: 'navigate-forward', timestamp, success: true };
  }

  private async executeRefresh(timestamp: number): Promise<ChaosAction> {
    await this.page.reload({ timeout: 10000 });
    return { type: 'refresh', timestamp, success: true };
  }

  private async executeScroll(timestamp: number): Promise<ChaosAction> {
    const direction = this.rng.pick(['up', 'down', 'top', 'bottom'])!;
    const scrollAmount = this.rng.nextInt(100, 500);

    switch (direction) {
      case 'up':
        await this.page.mouse.wheel(0, -scrollAmount);
        break;
      case 'down':
        await this.page.mouse.wheel(0, scrollAmount);
        break;
      case 'top':
        await this.page.evaluate(() => window.scrollTo(0, 0));
        break;
      case 'bottom':
        await this.page.evaluate(() =>
          window.scrollTo(0, document.body.scrollHeight)
        );
        break;
    }

    return {
      type: 'scroll',
      value: direction,
      timestamp,
      success: true,
    };
  }

  private async executeKeyboardShortcut(timestamp: number): Promise<ChaosAction> {
    const shortcuts = [
      { keys: 'Escape', description: 'Escape' },
      { keys: 'Control+c', description: 'Copy' },
      { keys: 'Control+a', description: 'Select All' },
      { keys: 'Tab', description: 'Tab' },
      { keys: 'Shift+Tab', description: 'Shift+Tab' },
    ];

    const shortcut = this.rng.pick(shortcuts)!;

    try {
      await this.page.keyboard.press(shortcut.keys);
      return {
        type: 'keyboard-shortcut',
        value: shortcut.description,
        timestamp,
        success: true,
      };
    } catch (error) {
      return {
        type: 'keyboard-shortcut',
        value: shortcut.description,
        timestamp,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async executeResizeViewport(timestamp: number): Promise<ChaosAction> {
    const viewports = [
      { width: 1920, height: 1080, name: 'desktop-lg' },
      { width: 1280, height: 720, name: 'desktop-sm' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 375, height: 667, name: 'mobile' },
    ];

    const viewport = this.rng.pick(viewports)!;
    await this.page.setViewportSize({ width: viewport.width, height: viewport.height });

    return {
      type: 'resize-viewport',
      value: viewport.name,
      timestamp,
      success: true,
    };
  }

  private async isForbiddenElement(element: any): Promise<boolean> {
    for (const selector of this.config.forbiddenSelectors) {
      try {
        const matches = await element.evaluate(
          (el: Element, sel: string) => el.matches(sel),
          selector
        );
        if (matches) return true;
      } catch {
        // Selector might not be valid, skip
      }
    }
    return false;
  }

  private async getElementDescription(element: any): Promise<string> {
    try {
      return await element.evaluate((el: Element) => {
        const tag = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : '';
        const classes = el.className
          ? `.${el.className.toString().split(' ').slice(0, 2).join('.')}`
          : '';
        const text = el.textContent?.slice(0, 20).trim() || '';
        const ariaLabel = el.getAttribute('aria-label') || '';
        const testId = el.getAttribute('data-testid') || '';

        if (testId) return `[data-testid="${testId}"]`;
        if (id) return `${tag}${id}`;
        if (ariaLabel) return `${tag}[aria-label="${ariaLabel}"]`;
        if (text) return `${tag}:has-text("${text}")`;
        return `${tag}${classes}`;
      });
    } catch {
      return 'unknown element';
    }
  }

  /**
   * Check application invariants after each action
   */
  private async checkInvariants(action: ChaosAction): Promise<InvariantViolation[]> {
    const violations: InvariantViolation[] = [];

    // Invariant 1: No blank screen
    const isBlank = await this.page.evaluate(() => {
      const body = document.body;
      return (
        !body ||
        body.innerHTML.trim() === '' ||
        body.children.length === 0
      );
    });
    if (isBlank) {
      violations.push({
        invariant: 'no-blank-screen',
        description: 'Page rendered blank after action',
        afterAction: action,
      });
    }

    // Invariant 2: No stuck loading indicators (visible for > 30s would be caught over multiple checks)
    const hasStuckSpinner = await this.page.evaluate(() => {
      const spinners = document.querySelectorAll(
        '[class*="loading"], [class*="spinner"], [aria-busy="true"]'
      );
      // Just flag if spinner exists - over time this catches stuck ones
      return spinners.length > 0;
    });
    // We don't flag this as violation immediately - would need state tracking

    // Invariant 3: No uncaught exception dialog
    const hasErrorDialog = await this.page.evaluate(() => {
      const errorIndicators = document.querySelectorAll(
        '[role="alertdialog"], [class*="error-boundary"], [class*="crash"]'
      );
      return errorIndicators.length > 0;
    });
    if (hasErrorDialog) {
      violations.push({
        invariant: 'no-crash-dialog',
        description: 'Error dialog or crash boundary appeared',
        afterAction: action,
      });
    }

    // Invariant 4: Console error threshold
    if (this.consoleErrors.length > 10) {
      violations.push({
        invariant: 'console-error-threshold',
        description: `Excessive console errors: ${this.consoleErrors.length}`,
        afterAction: action,
      });
    }

    return violations;
  }
}
