/**
 * Form detection and field type inference
 */

import type { Page } from 'playwright';

import type {
  FormInfo,
  FormField,
  SubmitButtonInfo,
  InferredFieldType,
  RequiredReason,
} from '../types.js';

export class FormDetector {
  /**
   * Detect all forms on a page
   */
  async detectForms(page: Page): Promise<FormInfo[]> {
    const forms: FormInfo[] = [];

    // Detect actual <form> elements
    const formElements = await this.detectFormElements(page);
    forms.push(...formElements);

    // Detect form-like groups (inputs + button without <form>)
    const formLikeGroups = await this.detectFormLikeGroups(page);
    forms.push(...formLikeGroups);

    return forms;
  }

  /**
   * Detect actual <form> elements
   */
  private async detectFormElements(page: Page): Promise<FormInfo[]> {
    return page.evaluate(() => {
      const forms: FormInfo[] = [];
      const formElements = document.querySelectorAll('form');

      formElements.forEach((form, index) => {
        const fields = Array.from(
          form.querySelectorAll('input, textarea, select')
        ) as HTMLElement[];
        const submitBtn = form.querySelector(
          'button[type="submit"], input[type="submit"], button:not([type])'
        ) as HTMLElement | null;

        const formFields: FormField[] = fields.map((field) => {
          const input = field as HTMLInputElement;
          return {
            selector: getSelector(field),
            tagName: field.tagName.toLowerCase(),
            type: input.type || 'text',
            name: input.name || undefined,
            id: input.id || undefined,
            placeholder: input.placeholder || undefined,
            label: getFieldLabel(field),
            ariaLabel: field.getAttribute('aria-label') || undefined,
            inferredType: inferFieldType(field),
            isRequired: isFieldRequired(field),
            requiredReason: getRequiredReason(field),
          };
        });

        forms.push({
          selector: getSelector(form),
          id: form.id || undefined,
          name: form.getAttribute('name') || undefined,
          action: form.action || undefined,
          method: form.method || 'get',
          fields: formFields,
          submitButton: submitBtn
            ? {
                selector: getSelector(submitBtn),
                text: getButtonText(submitBtn),
                type: (submitBtn as HTMLButtonElement).type || 'submit',
                isDestructive: isDestructiveButton(submitBtn),
              }
            : undefined,
          isFormLike: false,
        });
      });

      return forms;

      // Helper functions (defined inside evaluate for browser context)
      function getSelector(el: Element): string {
        if (el.id) return `#${el.id}`;
        if (el.className && typeof el.className === 'string') {
          const classes = el.className.trim().split(/\s+/).slice(0, 2).join('.');
          if (classes) return `${el.tagName.toLowerCase()}.${classes}`;
        }
        const parent = el.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(
            (c) => c.tagName === el.tagName
          );
          if (siblings.length > 1) {
            const index = siblings.indexOf(el);
            return `${getSelector(parent)} > ${el.tagName.toLowerCase()}:nth-of-type(${index + 1})`;
          }
        }
        return el.tagName.toLowerCase();
      }

      function getFieldLabel(field: Element): string | undefined {
        const id = field.id;
        if (id) {
          const label = document.querySelector(`label[for="${id}"]`);
          if (label) return label.textContent?.trim();
        }
        const parentLabel = field.closest('label');
        if (parentLabel) return parentLabel.textContent?.trim();
        return undefined;
      }

      function inferFieldType(field: Element): InferredFieldType {
        const input = field as HTMLInputElement;
        const type = input.type?.toLowerCase() || '';
        const name = (input.name || '').toLowerCase();
        const id = (input.id || '').toLowerCase();
        const label = getFieldLabel(field)?.toLowerCase() || '';
        const placeholder = (input.placeholder || '').toLowerCase();
        const combined = `${name} ${id} ${label} ${placeholder}`;

        if (type === 'email' || combined.includes('email')) return 'email';
        if (type === 'tel' || combined.includes('phone') || combined.includes('tel'))
          return 'phone';
        if (type === 'password' || combined.includes('password')) return 'password';
        if (
          combined.includes('zip') ||
          combined.includes('postal') ||
          combined.includes('postcode')
        )
          return 'postal';
        if (type === 'number') return 'number';
        if (type === 'date' || type === 'datetime-local') return 'date';
        if (field.tagName.toLowerCase() === 'textarea') return 'textarea';
        if (field.tagName.toLowerCase() === 'select') return 'select';
        if (type === 'checkbox') return 'checkbox';
        if (type === 'radio') return 'radio';
        if (type === 'file') return 'file';
        if (type === 'text' || type === '') return 'text';
        return 'unknown';
      }

      function isFieldRequired(field: Element): boolean {
        const input = field as HTMLInputElement;
        if (input.required) return true;
        if (field.getAttribute('aria-required') === 'true') return true;
        const label = getFieldLabel(field) || '';
        if (label.includes('*') || label.toLowerCase().includes('required')) return true;
        return false;
      }

      function getRequiredReason(field: Element): RequiredReason {
        const input = field as HTMLInputElement;
        if (input.required) return 'required-attribute';
        if (field.getAttribute('aria-required') === 'true') return 'aria-required';
        const label = getFieldLabel(field) || '';
        if (label.includes('*')) return 'label-asterisk';
        if (label.toLowerCase().includes('required')) return 'label-text';
        return 'none';
      }

      function getButtonText(btn: Element): string {
        const text =
          btn.textContent?.trim() ||
          (btn as HTMLInputElement).value ||
          btn.getAttribute('aria-label') ||
          '';
        return text.slice(0, 50);
      }

      function isDestructiveButton(btn: Element): boolean {
        const text = getButtonText(btn).toLowerCase();
        const destructivePatterns = [
          'delete',
          'remove',
          'cancel',
          'pay',
          'purchase',
          'buy',
          'checkout',
          'unsubscribe',
          'close account',
          'terminate',
        ];
        return destructivePatterns.some((pattern) => text.includes(pattern));
      }
    });
  }

  /**
   * Detect form-like groups (inputs + submit button without actual <form>)
   */
  private async detectFormLikeGroups(page: Page): Promise<FormInfo[]> {
    return page.evaluate(() => {
      const forms: FormInfo[] = [];

      // Find containers with inputs and buttons that aren't inside a <form>
      const containers = document.querySelectorAll(
        'div, section, article, main, aside'
      );

      containers.forEach((container) => {
        // Skip if inside a form
        if (container.closest('form')) return;

        const inputs = container.querySelectorAll(
          'input:not([type="hidden"]), textarea, select'
        );
        const buttons = container.querySelectorAll(
          'button, input[type="submit"], input[type="button"]'
        );

        // Must have at least one input and one button
        if (inputs.length === 0 || buttons.length === 0) return;

        // Check if this container seems to be a form-like group
        const hasSubmitButton = Array.from(buttons).some((btn) => {
          const text = (
            btn.textContent?.trim() ||
            (btn as HTMLInputElement).value ||
            ''
          ).toLowerCase();
          const submitPatterns = [
            'submit',
            'send',
            'save',
            'sign',
            'login',
            'register',
            'search',
            'subscribe',
            'contact',
            'continue',
            'next',
            'go',
          ];
          return submitPatterns.some((p) => text.includes(p));
        });

        if (!hasSubmitButton) return;

        // Avoid duplicating if already inside another detected form-like group
        const alreadyInFormLike = Array.from(inputs).some((input) =>
          forms.some((f) => f.fields.some((field) => field.selector === getSelector(input)))
        );
        if (alreadyInFormLike) return;

        const fields: FormField[] = Array.from(inputs).map((field) => {
          const input = field as HTMLInputElement;
          return {
            selector: getSelector(field),
            tagName: field.tagName.toLowerCase(),
            type: input.type || 'text',
            name: input.name || undefined,
            id: input.id || undefined,
            placeholder: input.placeholder || undefined,
            label: getFieldLabel(field),
            ariaLabel: field.getAttribute('aria-label') || undefined,
            inferredType: inferFieldType(field),
            isRequired: isFieldRequired(field),
            requiredReason: getRequiredReason(field),
          };
        });

        const submitBtn = Array.from(buttons).find((btn) => {
          const text = (
            btn.textContent?.trim() ||
            (btn as HTMLInputElement).value ||
            ''
          ).toLowerCase();
          const submitPatterns = ['submit', 'send', 'save', 'sign', 'login', 'register'];
          return submitPatterns.some((p) => text.includes(p));
        }) as HTMLElement | undefined;

        forms.push({
          selector: getSelector(container),
          id: container.id || undefined,
          name: undefined,
          action: undefined,
          method: 'post',
          fields,
          submitButton: submitBtn
            ? {
                selector: getSelector(submitBtn),
                text: getButtonText(submitBtn),
                type: (submitBtn as HTMLButtonElement).type || 'button',
                isDestructive: isDestructiveButton(submitBtn),
              }
            : undefined,
          isFormLike: true,
        });
      });

      return forms;

      // Helper functions (same as above, repeated for browser context)
      function getSelector(el: Element): string {
        if (el.id) return `#${el.id}`;
        if (el.className && typeof el.className === 'string') {
          const classes = el.className.trim().split(/\s+/).slice(0, 2).join('.');
          if (classes) return `${el.tagName.toLowerCase()}.${classes}`;
        }
        const parent = el.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(
            (c) => c.tagName === el.tagName
          );
          if (siblings.length > 1) {
            const index = siblings.indexOf(el);
            return `${getSelector(parent)} > ${el.tagName.toLowerCase()}:nth-of-type(${index + 1})`;
          }
        }
        return el.tagName.toLowerCase();
      }

      function getFieldLabel(field: Element): string | undefined {
        const id = field.id;
        if (id) {
          const label = document.querySelector(`label[for="${id}"]`);
          if (label) return label.textContent?.trim();
        }
        const parentLabel = field.closest('label');
        if (parentLabel) return parentLabel.textContent?.trim();
        return undefined;
      }

      function inferFieldType(field: Element): InferredFieldType {
        const input = field as HTMLInputElement;
        const type = input.type?.toLowerCase() || '';
        const name = (input.name || '').toLowerCase();
        const id = (input.id || '').toLowerCase();
        const label = getFieldLabel(field)?.toLowerCase() || '';
        const placeholder = (input.placeholder || '').toLowerCase();
        const combined = `${name} ${id} ${label} ${placeholder}`;

        if (type === 'email' || combined.includes('email')) return 'email';
        if (type === 'tel' || combined.includes('phone') || combined.includes('tel'))
          return 'phone';
        if (type === 'password' || combined.includes('password')) return 'password';
        if (
          combined.includes('zip') ||
          combined.includes('postal') ||
          combined.includes('postcode')
        )
          return 'postal';
        if (type === 'number') return 'number';
        if (type === 'date' || type === 'datetime-local') return 'date';
        if (field.tagName.toLowerCase() === 'textarea') return 'textarea';
        if (field.tagName.toLowerCase() === 'select') return 'select';
        if (type === 'checkbox') return 'checkbox';
        if (type === 'radio') return 'radio';
        if (type === 'file') return 'file';
        if (type === 'text' || type === '') return 'text';
        return 'unknown';
      }

      function isFieldRequired(field: Element): boolean {
        const input = field as HTMLInputElement;
        if (input.required) return true;
        if (field.getAttribute('aria-required') === 'true') return true;
        const label = getFieldLabel(field) || '';
        if (label.includes('*') || label.toLowerCase().includes('required')) return true;
        return false;
      }

      function getRequiredReason(field: Element): RequiredReason {
        const input = field as HTMLInputElement;
        if (input.required) return 'required-attribute';
        if (field.getAttribute('aria-required') === 'true') return 'aria-required';
        const label = getFieldLabel(field) || '';
        if (label.includes('*')) return 'label-asterisk';
        if (label.toLowerCase().includes('required')) return 'label-text';
        return 'none';
      }

      function getButtonText(btn: Element): string {
        const text =
          btn.textContent?.trim() ||
          (btn as HTMLInputElement).value ||
          btn.getAttribute('aria-label') ||
          '';
        return text.slice(0, 50);
      }

      function isDestructiveButton(btn: Element): boolean {
        const text = getButtonText(btn).toLowerCase();
        const destructivePatterns = [
          'delete',
          'remove',
          'cancel',
          'pay',
          'purchase',
          'buy',
          'checkout',
          'unsubscribe',
          'close account',
          'terminate',
        ];
        return destructivePatterns.some((pattern) => text.includes(pattern));
      }
    });
  }
}
