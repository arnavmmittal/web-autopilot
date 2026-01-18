/**
 * Lightweight accessibility checks
 * - Missing labels for inputs
 * - Buttons/links without accessible names
 * - Basic focus trap detection for modals
 */

import type { BrowserContext, Page } from 'playwright';

import { EvidenceCollector } from '../evidence/collector.js';
import type { RunConfig, Issue, A11yIssue } from '../types.js';

interface A11yCheckerOptions {
  context: BrowserContext;
  config: RunConfig;
  evidenceCollector: EvidenceCollector;
  onIssue: (issue: Issue) => void;
}

export class A11yChecker {
  private context: BrowserContext;
  private config: RunConfig;
  private evidenceCollector: EvidenceCollector;
  private onIssue: (issue: Issue) => void;

  constructor(options: A11yCheckerOptions) {
    this.context = options.context;
    this.config = options.config;
    this.evidenceCollector = options.evidenceCollector;
    this.onIssue = options.onIssue;
  }

  /**
   * Run accessibility checks on a page
   */
  async checkPage(pageUrl: string): Promise<void> {
    const page = await this.context.newPage();

    try {
      await page.goto(pageUrl, {
        timeout: this.config.timeoutMs,
        waitUntil: 'domcontentloaded',
      });

      // Check for missing labels on inputs
      await this.checkMissingLabels(page, pageUrl);

      // Check for buttons/links without accessible names
      await this.checkMissingNames(page, pageUrl);

      // Check for potential focus traps (if modals are detected)
      await this.checkFocusTraps(page, pageUrl);
    } catch {
      // Page load failed - skip a11y checks
    } finally {
      await page.close();
    }
  }

  /**
   * Check for input fields without accessible labels
   */
  private async checkMissingLabels(page: Page, pageUrl: string): Promise<void> {
    const issues = await page.evaluate(() => {
      const results: A11yIssue[] = [];

      // Find all form inputs that should have labels
      const inputs = document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), textarea, select'
      );

      inputs.forEach((input) => {
        const hasLabel = (() => {
          // Check for aria-label
          if (input.getAttribute('aria-label')) return true;

          // Check for aria-labelledby
          const labelledBy = input.getAttribute('aria-labelledby');
          if (labelledBy) {
            const labelEl = document.getElementById(labelledBy);
            if (labelEl && labelEl.textContent?.trim()) return true;
          }

          // Check for associated label
          const id = input.id;
          if (id) {
            const label = document.querySelector(`label[for="${id}"]`);
            if (label && label.textContent?.trim()) return true;
          }

          // Check for wrapping label
          const parentLabel = input.closest('label');
          if (parentLabel && parentLabel.textContent?.trim()) return true;

          // Check for placeholder (not ideal but acceptable in some cases)
          if ((input as HTMLInputElement).placeholder) return true;

          // Check for title attribute (fallback)
          if (input.getAttribute('title')) return true;

          return false;
        })();

        if (!hasLabel) {
          results.push({
            type: 'missing-label',
            element: input.outerHTML.slice(0, 200),
            selector: getSelector(input),
            description: `Input field has no accessible label`,
            wcagCriteria: 'WCAG 2.1 - 1.3.1 Info and Relationships',
          });
        }
      });

      return results;

      function getSelector(el: Element): string {
        if (el.id) return `#${el.id}`;
        if (el.className && typeof el.className === 'string') {
          const classes = el.className.trim().split(/\s+/).slice(0, 2).join('.');
          if (classes) return `${el.tagName.toLowerCase()}.${classes}`;
        }
        return el.tagName.toLowerCase();
      }
    });

    for (const a11yIssue of issues) {
      const issue = await this.evidenceCollector.createIssue({
        category: 'a11y-missing-label',
        title: `Input missing accessible label`,
        description: `${a11yIssue.description}. Element: ${a11yIssue.element}`,
        pageUrl,
        selectors: [a11yIssue.selector],
        reproSteps: [
          `Navigate to ${pageUrl}`,
          `Locate input: ${a11yIssue.selector}`,
          `Use screen reader or accessibility tools`,
          `Observe: Input has no accessible label`,
        ],
        expectedBehavior:
          'Input should have an accessible label via <label>, aria-label, or aria-labelledby',
        actualBehavior: 'Input has no accessible name for assistive technologies',
        severity: 'medium',
        suggestedFix: `Add a <label for="..."> element or aria-label attribute to: ${a11yIssue.selector}`,
      });

      this.onIssue(issue);
    }
  }

  /**
   * Check for buttons and links without accessible names
   */
  private async checkMissingNames(page: Page, pageUrl: string): Promise<void> {
    const issues = await page.evaluate(() => {
      const results: A11yIssue[] = [];

      // Check buttons
      const buttons = document.querySelectorAll('button, [role="button"]');
      buttons.forEach((button) => {
        const hasName = (() => {
          // Check text content
          if (button.textContent?.trim()) return true;
          // Check aria-label
          if (button.getAttribute('aria-label')) return true;
          // Check aria-labelledby
          const labelledBy = button.getAttribute('aria-labelledby');
          if (labelledBy && document.getElementById(labelledBy)?.textContent?.trim()) return true;
          // Check title
          if (button.getAttribute('title')) return true;
          // Check for image with alt inside
          const img = button.querySelector('img[alt]');
          if (img && img.getAttribute('alt')) return true;
          // Check for SVG with title
          const svg = button.querySelector('svg title');
          if (svg && svg.textContent?.trim()) return true;

          return false;
        })();

        if (!hasName) {
          results.push({
            type: 'missing-name',
            element: button.outerHTML.slice(0, 200),
            selector: getSelector(button),
            description: 'Button has no accessible name',
            wcagCriteria: 'WCAG 2.1 - 4.1.2 Name, Role, Value',
          });
        }
      });

      // Check links
      const links = document.querySelectorAll('a[href]');
      links.forEach((link) => {
        const hasName = (() => {
          if (link.textContent?.trim()) return true;
          if (link.getAttribute('aria-label')) return true;
          const labelledBy = link.getAttribute('aria-labelledby');
          if (labelledBy && document.getElementById(labelledBy)?.textContent?.trim()) return true;
          if (link.getAttribute('title')) return true;
          const img = link.querySelector('img[alt]');
          if (img && img.getAttribute('alt')) return true;

          return false;
        })();

        if (!hasName) {
          results.push({
            type: 'missing-name',
            element: link.outerHTML.slice(0, 200),
            selector: getSelector(link),
            description: 'Link has no accessible name',
            wcagCriteria: 'WCAG 2.1 - 2.4.4 Link Purpose',
          });
        }
      });

      return results;

      function getSelector(el: Element): string {
        if (el.id) return `#${el.id}`;
        if (el.className && typeof el.className === 'string') {
          const classes = el.className.trim().split(/\s+/).slice(0, 2).join('.');
          if (classes) return `${el.tagName.toLowerCase()}.${classes}`;
        }
        return el.tagName.toLowerCase();
      }
    });

    for (const a11yIssue of issues) {
      const issue = await this.evidenceCollector.createIssue({
        category: 'a11y-missing-name',
        title: `${a11yIssue.description}`,
        description: `Element: ${a11yIssue.element}. WCAG: ${a11yIssue.wcagCriteria}`,
        pageUrl,
        selectors: [a11yIssue.selector],
        reproSteps: [
          `Navigate to ${pageUrl}`,
          `Locate element: ${a11yIssue.selector}`,
          `Use screen reader or check with accessibility tools`,
          `Observe: Element has no accessible name`,
        ],
        expectedBehavior: 'Interactive element should have an accessible name',
        actualBehavior: 'Element is announced without a meaningful name',
        severity: 'medium',
        suggestedFix: `Add text content, aria-label, or aria-labelledby to: ${a11yIssue.selector}`,
      });

      this.onIssue(issue);
    }
  }

  /**
   * Check for focus trap issues in modals
   */
  private async checkFocusTraps(page: Page, pageUrl: string): Promise<void> {
    // Detect potential modals
    const modals = await page.evaluate(() => {
      const modalPatterns = [
        '[role="dialog"]',
        '[role="alertdialog"]',
        '[aria-modal="true"]',
        '.modal',
        '.dialog',
        '[class*="modal"]',
        '[class*="dialog"]',
        '[class*="overlay"]',
      ];

      const elements: { selector: string; isVisible: boolean }[] = [];

      for (const pattern of modalPatterns) {
        const matches = document.querySelectorAll(pattern);
        matches.forEach((el) => {
          const style = window.getComputedStyle(el);
          const isVisible =
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0';

          elements.push({
            selector: el.id ? `#${el.id}` : pattern,
            isVisible,
          });
        });
      }

      return elements;
    });

    // For visible modals, check focus trap
    for (const modal of modals) {
      if (!modal.isVisible) continue;

      const hasFocusTrap = await page.evaluate((selector: string) => {
        const modalEl = document.querySelector(selector);
        if (!modalEl) return true; // Assume OK if not found

        // Check if there are focusable elements inside
        const focusableElements = modalEl.querySelectorAll(
          'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) return true; // No focusable elements

        // Check if first focusable element is focused or modal handles focus
        const activeElement = document.activeElement;
        const isInsideModal = modalEl.contains(activeElement);

        // Check for focus trap attributes
        const hasTrapIndicator =
          modalEl.hasAttribute('aria-modal') ||
          modalEl.getAttribute('role') === 'dialog' ||
          modalEl.getAttribute('role') === 'alertdialog';

        return hasTrapIndicator;
      }, modal.selector);

      if (!hasFocusTrap) {
        const issue = await this.evidenceCollector.createIssue({
          category: 'a11y-focus-trap',
          title: `Modal may not trap focus properly`,
          description: `Modal "${modal.selector}" is visible but may not implement proper focus trapping for keyboard users.`,
          pageUrl,
          selectors: [modal.selector],
          reproSteps: [
            `Navigate to ${pageUrl}`,
            `Open modal: ${modal.selector}`,
            `Press Tab key repeatedly`,
            `Observe: Focus may escape the modal`,
          ],
          expectedBehavior:
            'Focus should be trapped within the modal while it is open',
          actualBehavior: 'Focus may escape the modal to background content',
          severity: 'high',
          suggestedFix:
            'Implement focus trapping: trap Tab navigation within modal, return focus when closed, and add aria-modal="true"',
        });

        this.onIssue(issue);
      }
    }
  }
}
