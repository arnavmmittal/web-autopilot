/**
 * Form testing - validates required fields and invalid input handling
 */

import type { BrowserContext, Page } from 'playwright';

import { EvidenceCollector } from '../evidence/collector.js';
import type { RunConfig, FormInfo, FormField, Issue, InferredFieldType } from '../types.js';

interface FormTesterOptions {
  context: BrowserContext;
  config: RunConfig;
  evidenceCollector: EvidenceCollector;
  onIssue: (issue: Issue) => void;
}

// Invalid values for different field types
const INVALID_VALUES: Record<InferredFieldType, string> = {
  email: 'invalid-email',
  phone: 'abc',
  password: '',
  postal: 'invalid',
  text: '',
  number: 'abc',
  date: 'not-a-date',
  textarea: '',
  select: '',
  checkbox: '',
  radio: '',
  file: '',
  unknown: '',
};

// Plausible valid values for different field types
const VALID_VALUES: Record<InferredFieldType, string> = {
  email: 'test@example.com',
  phone: '+1-555-555-5555',
  password: 'TestPassword123!',
  postal: '12345',
  text: 'Test input',
  number: '42',
  date: '2024-01-15',
  textarea: 'This is a test message for the form.',
  select: '', // Will select first option
  checkbox: 'checked',
  radio: 'checked',
  file: '', // Skip file inputs
  unknown: 'test',
};

export class FormTester {
  private context: BrowserContext;
  private config: RunConfig;
  private evidenceCollector: EvidenceCollector;
  private onIssue: (issue: Issue) => void;

  constructor(options: FormTesterOptions) {
    this.context = options.context;
    this.config = options.config;
    this.evidenceCollector = options.evidenceCollector;
    this.onIssue = options.onIssue;
  }

  /**
   * Test a form for validation issues
   */
  async testForm(pageUrl: string, form: FormInfo): Promise<void> {
    // Skip forms without submit buttons
    if (!form.submitButton) return;

    // Skip destructive actions unless allowed
    if (form.submitButton.isDestructive && !this.config.allowDestructive) {
      return;
    }

    const page = await this.context.newPage();

    try {
      await page.goto(pageUrl, {
        timeout: this.config.timeoutMs,
        waitUntil: 'domcontentloaded',
      });

      // Test 1: Required field validation
      await this.testRequiredFields(page, pageUrl, form);

      // Test 2: Invalid input validation
      await this.testInvalidInputs(page, pageUrl, form);

      // Test 3: Happy path smoke test (if safe)
      if (this.isSafeToSubmit(form)) {
        await this.testHappyPath(page, pageUrl, form);
      }
    } catch (error) {
      // Form testing errors are not critical
    } finally {
      await page.close();
    }
  }

  /**
   * Test required field validation
   */
  private async testRequiredFields(page: Page, pageUrl: string, form: FormInfo): Promise<void> {
    const requiredFields = form.fields.filter((f) => f.isRequired);

    if (requiredFields.length === 0) return;

    // Try to submit without filling required fields
    try {
      // Start tracing
      await page.context().tracing.start({ screenshots: true, snapshots: true });

      // Click submit
      if (form.submitButton) {
        await page.click(form.submitButton.selector, { timeout: 5000 });
      }

      // Wait a moment for validation to appear
      await page.waitForTimeout(500);

      // Check for validation errors
      const hasValidation = await this.checkForValidationError(page, requiredFields);

      if (!hasValidation) {
        // No validation shown - this is an issue
        const issue = await this.evidenceCollector.createIssue({
          category: 'form-required',
          title: `Missing required field validation`,
          description: `Form allows submission without filling required fields: ${requiredFields.map((f) => f.name || f.selector).join(', ')}`,
          pageUrl,
          selectors: [form.selector, ...requiredFields.map((f) => f.selector)],
          reproSteps: [
            `Navigate to ${pageUrl}`,
            `Locate form: ${form.selector}`,
            `Leave required fields empty`,
            `Click submit button: ${form.submitButton?.text}`,
            `Observe: No validation error is shown`,
          ],
          expectedBehavior: 'Form should show validation errors for required fields',
          actualBehavior: 'Form submitted or no validation feedback was displayed',
          severity: 'high',
        });
        this.onIssue(issue);
      }

      // Stop tracing
      const tracePath = await this.evidenceCollector.saveTrace(page);

      // Take screenshot
      await this.evidenceCollector.takeScreenshot(page, `form-required-${Date.now()}`);
    } catch (error) {
      // Click failed - button might be disabled, which is fine
    }

    // Reload page for next test
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
  }

  /**
   * Test invalid input handling
   */
  private async testInvalidInputs(page: Page, pageUrl: string, form: FormInfo): Promise<void> {
    const validatableFields = form.fields.filter((f) =>
      ['email', 'phone', 'postal', 'number'].includes(f.inferredType)
    );

    if (validatableFields.length === 0) return;

    for (const field of validatableFields) {
      try {
        // Reload page for clean state
        await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });

        // Fill field with invalid value
        const invalidValue = INVALID_VALUES[field.inferredType];
        await page.fill(field.selector, invalidValue, { timeout: 5000 });

        // Fill other required fields with valid values
        for (const otherField of form.fields) {
          if (otherField.selector !== field.selector && otherField.isRequired) {
            const validValue = VALID_VALUES[otherField.inferredType];
            if (validValue && otherField.inferredType !== 'file') {
              try {
                await page.fill(otherField.selector, validValue, { timeout: 3000 });
              } catch {
                // Field might not be fillable
              }
            }
          }
        }

        // Try to submit
        if (form.submitButton) {
          await page.click(form.submitButton.selector, { timeout: 5000 });
        }

        await page.waitForTimeout(500);

        // Check for validation
        const hasValidation = await this.checkForFieldError(page, field);

        if (!hasValidation) {
          const issue = await this.evidenceCollector.createIssue({
            category: 'form-invalid-input',
            title: `Missing ${field.inferredType} validation`,
            description: `Field "${field.name || field.id || field.selector}" accepts invalid ${field.inferredType} value: "${invalidValue}"`,
            pageUrl,
            selectors: [form.selector, field.selector],
            reproSteps: [
              `Navigate to ${pageUrl}`,
              `Fill field ${field.selector} with: "${invalidValue}"`,
              `Submit the form`,
              `Observe: No validation error shown for invalid ${field.inferredType}`,
            ],
            expectedBehavior: `Field should validate ${field.inferredType} format and show an error`,
            actualBehavior: `Invalid ${field.inferredType} "${invalidValue}" was accepted`,
            severity: 'medium',
          });
          this.onIssue(issue);

          await this.evidenceCollector.takeScreenshot(
            page,
            `form-invalid-${field.inferredType}-${Date.now()}`
          );
        }
      } catch {
        // Skip this field if test fails
      }
    }
  }

  /**
   * Test happy path submission (if safe)
   */
  private async testHappyPath(page: Page, pageUrl: string, form: FormInfo): Promise<void> {
    try {
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });

      // Fill all fields with valid values
      for (const field of form.fields) {
        if (field.inferredType === 'file') continue;
        if (field.inferredType === 'checkbox' || field.inferredType === 'radio') {
          try {
            await page.check(field.selector, { timeout: 3000 });
          } catch {
            // Skip
          }
          continue;
        }
        if (field.inferredType === 'select') {
          try {
            // Select first option
            await page.selectOption(field.selector, { index: 1 }, { timeout: 3000 });
          } catch {
            // Skip
          }
          continue;
        }

        const value = VALID_VALUES[field.inferredType];
        if (value) {
          try {
            await page.fill(field.selector, value, { timeout: 3000 });
          } catch {
            // Skip
          }
        }
      }

      // Submit if we have all required fields filled
      if (form.submitButton) {
        // Don't actually submit - just verify form is fillable
        // This prevents accidental data submission
      }
    } catch {
      // Happy path test failed - not critical
    }
  }

  /**
   * Check if form is safe to submit (for happy path)
   */
  private isSafeToSubmit(form: FormInfo): boolean {
    if (!form.submitButton) return false;
    if (form.submitButton.isDestructive) return false;

    const safeButtonTexts = ['submit', 'send', 'contact', 'sign up', 'subscribe', 'save'];
    const buttonText = form.submitButton.text.toLowerCase();

    return safeButtonTexts.some((safe) => buttonText.includes(safe));
  }

  /**
   * Check if validation error is shown for any required field
   */
  private async checkForValidationError(page: Page, fields: FormField[]): Promise<boolean> {
    // Check for common validation indicators
    const checks = await page.evaluate((fieldSelectors: string[]) => {
      // Check for visible error messages
      const errorPatterns = [
        '[class*="error"]',
        '[class*="invalid"]',
        '[class*="validation"]',
        '[role="alert"]',
        '.help-block.error',
        '.field-error',
        '.form-error',
      ];

      for (const pattern of errorPatterns) {
        const errors = document.querySelectorAll(pattern);
        for (const error of errors) {
          if ((error as HTMLElement).offsetParent !== null) {
            // Element is visible
            const text = error.textContent?.toLowerCase() || '';
            if (
              text.includes('required') ||
              text.includes('please') ||
              text.includes('must') ||
              text.includes('invalid')
            ) {
              return true;
            }
          }
        }
      }

      // Check if any field has aria-invalid="true"
      for (const selector of fieldSelectors) {
        try {
          const field = document.querySelector(selector);
          if (field?.getAttribute('aria-invalid') === 'true') {
            return true;
          }
        } catch {
          // Invalid selector
        }
      }

      // Check for native validation (:invalid pseudo-class effect)
      // This is tricky in browser context, so we check for related aria

      return false;
    }, fields.map((f) => f.selector));

    return checks;
  }

  /**
   * Check if a specific field has validation error
   */
  private async checkForFieldError(page: Page, field: FormField): Promise<boolean> {
    return page.evaluate((selector: string) => {
      try {
        const element = document.querySelector(selector);
        if (!element) return false;

        // Check aria-invalid
        if (element.getAttribute('aria-invalid') === 'true') return true;

        // Check for error class on field
        if (
          element.className.includes('error') ||
          element.className.includes('invalid')
        ) {
          return true;
        }

        // Check for aria-describedby pointing to error message
        const describedBy = element.getAttribute('aria-describedby');
        if (describedBy) {
          const errorEl = document.getElementById(describedBy);
          if (errorEl) {
            const text = errorEl.textContent?.toLowerCase() || '';
            if (
              text.includes('error') ||
              text.includes('invalid') ||
              text.includes('required')
            ) {
              return true;
            }
          }
        }

        // Check for sibling/nearby error message
        const parent = element.parentElement;
        if (parent) {
          const errorEls = parent.querySelectorAll(
            '[class*="error"], [class*="invalid"], [role="alert"]'
          );
          for (const el of errorEls) {
            if ((el as HTMLElement).offsetParent !== null) {
              return true;
            }
          }
        }

        return false;
      } catch {
        return false;
      }
    }, field.selector);
  }
}
