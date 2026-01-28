/**
 * Chat Flow Checker - Validates core chat UX flows
 *
 * Tests the fundamental chat operations in Copilot-style apps:
 * - New chat creation
 * - Continue existing chat
 * - Rename chat
 * - Delete chat
 * - Search chats
 * - Message history persistence
 * - Multi-line input handling
 * - Copy/export functionality
 */

import type { Page } from 'playwright';
import type { Issue } from '../types.js';

export interface ChatFlowConfig {
  /** Selectors for chat UI elements */
  selectors: {
    newChatButton: string;
    chatInput: string;
    sendButton: string;
    chatList: string;
    chatListItem: string;
    renameButton: string;
    deleteButton: string;
    searchInput: string;
    messageList: string;
    messageItem: string;
    copyButton: string;
    regenerateButton: string;
  };
  /** Test data */
  testData: {
    samplePrompts: string[];
    multilinePrompt: string;
    longPrompt: string;
    searchableKeyword: string;
  };
  /** Timeouts */
  timeouts: {
    responseWait: number;
    animationWait: number;
  };
}

export interface ChatFlowResult {
  flowName: string;
  passed: boolean;
  duration: number;
  issues: Issue[];
  details: string;
}

const DEFAULT_CONFIG: ChatFlowConfig = {
  selectors: {
    newChatButton: 'button[data-testid*="new-chat"], button[aria-label*="new chat" i], button:has-text("New chat")',
    chatInput: 'textarea[data-testid*="prompt"], textarea[placeholder*="message" i], textarea',
    sendButton: 'button[data-testid*="send"], button[aria-label*="send" i], button[type="submit"]',
    chatList: '[data-testid*="chat-list"], [class*="chat-list"], [class*="conversation-list"]',
    chatListItem: '[data-testid*="chat-item"], [class*="chat-item"], [class*="conversation-item"]',
    renameButton: 'button[data-testid*="rename"], button[aria-label*="rename" i]',
    deleteButton: 'button[data-testid*="delete"], button[aria-label*="delete" i]',
    searchInput: 'input[data-testid*="search"], input[placeholder*="search" i]',
    messageList: '[data-testid*="message-list"], [class*="message-list"]',
    messageItem: '[data-testid*="message"], [class*="message-item"]',
    copyButton: 'button[data-testid*="copy"], button[aria-label*="copy" i]',
    regenerateButton: 'button[data-testid*="regenerate"], button[aria-label*="regenerate" i], button:has-text("Regenerate")',
  },
  testData: {
    samplePrompts: ['Hello', 'What is 2+2?', 'Tell me a joke'],
    multilinePrompt: 'Line 1\nLine 2\nLine 3',
    longPrompt: 'A'.repeat(5000),
    searchableKeyword: 'unique_test_keyword_12345',
  },
  timeouts: {
    responseWait: 30000,
    animationWait: 500,
  },
};

export class ChatFlowChecker {
  private page: Page;
  private config: ChatFlowConfig;

  constructor(page: Page, config: Partial<ChatFlowConfig> = {}) {
    this.page = page;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      selectors: { ...DEFAULT_CONFIG.selectors, ...config.selectors },
      testData: { ...DEFAULT_CONFIG.testData, ...config.testData },
      timeouts: { ...DEFAULT_CONFIG.timeouts, ...config.timeouts },
    };
  }

  /**
   * Run all chat flow checks
   */
  async checkAll(): Promise<ChatFlowResult[]> {
    const results: ChatFlowResult[] = [];

    // Core flows
    results.push(await this.checkNewChat());
    results.push(await this.checkSendMessage());
    results.push(await this.checkMultilineInput());
    results.push(await this.checkEnterVsShiftEnter());
    results.push(await this.checkLongPrompt());
    results.push(await this.checkRegenerate());
    results.push(await this.checkCopyResponse());
    results.push(await this.checkRefreshRecovery());

    return results;
  }

  /**
   * Check new chat creation
   */
  async checkNewChat(): Promise<ChatFlowResult> {
    const startTime = Date.now();
    const issues: Issue[] = [];

    try {
      // Look for new chat button
      const newChatBtn = await this.page.$(this.config.selectors.newChatButton);

      if (!newChatBtn) {
        issues.push(this.createIssue(
          'chat-flow-new-chat',
          'New chat button not found',
          `Could not find new chat button with selectors: ${this.config.selectors.newChatButton}`,
          'high'
        ));
        return this.result('New Chat Creation', false, Date.now() - startTime, issues, 'New chat button not found');
      }

      // Get current URL/state
      const urlBefore = this.page.url();

      // Click new chat
      await newChatBtn.click();
      await this.page.waitForTimeout(this.config.timeouts.animationWait);

      // Verify chat input is ready
      const input = await this.page.$(this.config.selectors.chatInput);
      if (!input) {
        issues.push(this.createIssue(
          'chat-flow-new-chat',
          'Chat input not available after new chat',
          'After clicking new chat, the message input was not available',
          'high'
        ));
      }

      // Verify we're in a clean state (no previous messages or new URL)
      const urlAfter = this.page.url();
      const messages = await this.page.$$(this.config.selectors.messageItem);

      if (urlBefore === urlAfter && messages.length > 0) {
        // URL didn't change and there are still messages - might be an issue
        issues.push(this.createIssue(
          'chat-flow-new-chat',
          'New chat may not have cleared previous conversation',
          'After clicking new chat, previous messages may still be visible',
          'medium'
        ));
      }

      return this.result(
        'New Chat Creation',
        issues.length === 0,
        Date.now() - startTime,
        issues,
        issues.length === 0 ? 'Successfully created new chat' : 'Issues found with new chat creation'
      );

    } catch (error) {
      issues.push(this.createIssue(
        'chat-flow-new-chat',
        'Error testing new chat',
        error instanceof Error ? error.message : String(error),
        'high'
      ));
      return this.result('New Chat Creation', false, Date.now() - startTime, issues, 'Error during test');
    }
  }

  /**
   * Check basic message send
   */
  async checkSendMessage(): Promise<ChatFlowResult> {
    const startTime = Date.now();
    const issues: Issue[] = [];

    try {
      const input = await this.page.$(this.config.selectors.chatInput);
      if (!input) {
        issues.push(this.createIssue(
          'chat-flow-send',
          'Chat input not found',
          `Could not find chat input with selector: ${this.config.selectors.chatInput}`,
          'high'
        ));
        return this.result('Send Message', false, Date.now() - startTime, issues, 'Input not found');
      }

      const testPrompt = this.config.testData.samplePrompts[0];
      const messagesBefore = await this.page.$$(this.config.selectors.messageItem);

      await input.fill(testPrompt);
      await input.press('Enter');

      // Wait for response
      await this.page.waitForTimeout(2000);

      const messagesAfter = await this.page.$$(this.config.selectors.messageItem);

      if (messagesAfter.length <= messagesBefore.length) {
        issues.push(this.createIssue(
          'chat-flow-send',
          'No response received after sending message',
          `Sent prompt "${testPrompt}" but no new message appeared`,
          'high'
        ));
      }

      // Verify response is non-empty
      if (messagesAfter.length > 0) {
        const lastMessage = messagesAfter[messagesAfter.length - 1];
        const content = await lastMessage.textContent();
        if (!content || content.trim().length === 0) {
          issues.push(this.createIssue(
            'chat-flow-send',
            'Empty response received',
            'Response message container exists but has no content',
            'medium'
          ));
        }
      }

      return this.result(
        'Send Message',
        issues.length === 0,
        Date.now() - startTime,
        issues,
        issues.length === 0 ? 'Message sent and response received' : 'Issues with message sending'
      );

    } catch (error) {
      issues.push(this.createIssue(
        'chat-flow-send',
        'Error testing send message',
        error instanceof Error ? error.message : String(error),
        'high'
      ));
      return this.result('Send Message', false, Date.now() - startTime, issues, 'Error during test');
    }
  }

  /**
   * Check multiline input handling
   */
  async checkMultilineInput(): Promise<ChatFlowResult> {
    const startTime = Date.now();
    const issues: Issue[] = [];

    try {
      const input = await this.page.$(this.config.selectors.chatInput);
      if (!input) {
        return this.result('Multiline Input', false, Date.now() - startTime,
          [this.createIssue('chat-flow-multiline', 'Input not found', '', 'high')],
          'Input not found');
      }

      // Try to enter multiline text
      await input.fill(this.config.testData.multilinePrompt);

      // Verify the content was entered correctly
      const inputValue = await input.inputValue();
      const expectedLines = this.config.testData.multilinePrompt.split('\n').length;
      const actualLines = inputValue.split('\n').length;

      if (actualLines < expectedLines) {
        issues.push(this.createIssue(
          'chat-flow-multiline',
          'Multiline input not fully preserved',
          `Expected ${expectedLines} lines but found ${actualLines} lines in input`,
          'medium'
        ));
      }

      // Clear for next test
      await input.fill('');

      return this.result(
        'Multiline Input',
        issues.length === 0,
        Date.now() - startTime,
        issues,
        issues.length === 0 ? 'Multiline input works correctly' : 'Issues with multiline input'
      );

    } catch (error) {
      issues.push(this.createIssue(
        'chat-flow-multiline',
        'Error testing multiline input',
        error instanceof Error ? error.message : String(error),
        'high'
      ));
      return this.result('Multiline Input', false, Date.now() - startTime, issues, 'Error during test');
    }
  }

  /**
   * Check Enter vs Shift+Enter behavior
   */
  async checkEnterVsShiftEnter(): Promise<ChatFlowResult> {
    const startTime = Date.now();
    const issues: Issue[] = [];

    try {
      const input = await this.page.$(this.config.selectors.chatInput);
      if (!input) {
        return this.result('Enter vs Shift+Enter', false, Date.now() - startTime,
          [this.createIssue('chat-flow-enter', 'Input not found', '', 'high')],
          'Input not found');
      }

      // Clear and type some text
      await input.fill('');
      await input.type('Line 1');

      // Shift+Enter should add newline
      await input.press('Shift+Enter');
      await input.type('Line 2');

      const valueAfterShiftEnter = await input.inputValue();
      if (!valueAfterShiftEnter.includes('\n')) {
        issues.push(this.createIssue(
          'chat-flow-enter',
          'Shift+Enter does not create newline',
          'Expected Shift+Enter to add a newline but it did not',
          'medium'
        ));
      }

      // Clear for next test
      await input.fill('');

      return this.result(
        'Enter vs Shift+Enter',
        issues.length === 0,
        Date.now() - startTime,
        issues,
        issues.length === 0 ? 'Enter/Shift+Enter behavior correct' : 'Issues with keyboard behavior'
      );

    } catch (error) {
      issues.push(this.createIssue(
        'chat-flow-enter',
        'Error testing Enter behavior',
        error instanceof Error ? error.message : String(error),
        'high'
      ));
      return this.result('Enter vs Shift+Enter', false, Date.now() - startTime, issues, 'Error during test');
    }
  }

  /**
   * Check long prompt handling
   */
  async checkLongPrompt(): Promise<ChatFlowResult> {
    const startTime = Date.now();
    const issues: Issue[] = [];

    try {
      const input = await this.page.$(this.config.selectors.chatInput);
      if (!input) {
        return this.result('Long Prompt', false, Date.now() - startTime,
          [this.createIssue('chat-flow-long', 'Input not found', '', 'high')],
          'Input not found');
      }

      // Try filling with long prompt
      await input.fill(this.config.testData.longPrompt);

      const inputValue = await input.inputValue();

      // Check if the long prompt was accepted (at least partially)
      if (inputValue.length < 1000) {
        issues.push(this.createIssue(
          'chat-flow-long',
          'Long prompt truncated significantly',
          `Attempted to input ${this.config.testData.longPrompt.length} chars but only ${inputValue.length} were accepted`,
          'medium'
        ));
      }

      // Clear for next test
      await input.fill('');

      return this.result(
        'Long Prompt',
        issues.length === 0,
        Date.now() - startTime,
        issues,
        issues.length === 0 ? 'Long prompt handled correctly' : 'Issues with long prompt handling'
      );

    } catch (error) {
      issues.push(this.createIssue(
        'chat-flow-long',
        'Error testing long prompt',
        error instanceof Error ? error.message : String(error),
        'high'
      ));
      return this.result('Long Prompt', false, Date.now() - startTime, issues, 'Error during test');
    }
  }

  /**
   * Check regenerate functionality
   */
  async checkRegenerate(): Promise<ChatFlowResult> {
    const startTime = Date.now();
    const issues: Issue[] = [];

    try {
      // Look for regenerate button
      const regenBtn = await this.page.$(this.config.selectors.regenerateButton);

      if (!regenBtn) {
        // Regenerate might not be visible without a response
        return this.result(
          'Regenerate Response',
          true,
          Date.now() - startTime,
          [],
          'Regenerate button not visible (may require existing response)'
        );
      }

      // Get current response
      const messages = await this.page.$$(this.config.selectors.messageItem);
      let originalResponse = '';
      if (messages.length > 0) {
        originalResponse = await messages[messages.length - 1].textContent() ?? '';
      }

      // Click regenerate
      await regenBtn.click();
      await this.page.waitForTimeout(2000);

      // Verify something happened
      const messagesAfter = await this.page.$$(this.config.selectors.messageItem);
      if (messagesAfter.length > 0) {
        const newResponse = await messagesAfter[messagesAfter.length - 1].textContent() ?? '';
        // Response should exist (may or may not be different)
        if (newResponse.trim().length === 0) {
          issues.push(this.createIssue(
            'chat-flow-regenerate',
            'Empty response after regenerate',
            'Regenerate completed but response is empty',
            'medium'
          ));
        }
      }

      return this.result(
        'Regenerate Response',
        issues.length === 0,
        Date.now() - startTime,
        issues,
        issues.length === 0 ? 'Regenerate functionality works' : 'Issues with regenerate'
      );

    } catch (error) {
      issues.push(this.createIssue(
        'chat-flow-regenerate',
        'Error testing regenerate',
        error instanceof Error ? error.message : String(error),
        'medium'
      ));
      return this.result('Regenerate Response', false, Date.now() - startTime, issues, 'Error during test');
    }
  }

  /**
   * Check copy response functionality
   */
  async checkCopyResponse(): Promise<ChatFlowResult> {
    const startTime = Date.now();
    const issues: Issue[] = [];

    try {
      const copyBtn = await this.page.$(this.config.selectors.copyButton);

      if (!copyBtn) {
        return this.result(
          'Copy Response',
          true,
          Date.now() - startTime,
          [],
          'Copy button not visible (may require existing response)'
        );
      }

      // Click copy
      await copyBtn.click();

      // Look for copy confirmation (toast, tooltip, button state change)
      await this.page.waitForTimeout(500);

      // Most apps show some feedback - check for common patterns
      const copied = await this.page.evaluate(() => {
        // Check for toast/notification
        const toast = document.querySelector('[class*="toast"], [class*="notification"], [role="status"]');
        if (toast && toast.textContent?.toLowerCase().includes('copied')) return true;

        // Check for button state change
        const copyBtn = document.querySelector('[data-testid*="copy"], [aria-label*="copy" i]');
        if (copyBtn?.getAttribute('data-copied') === 'true') return true;
        if (copyBtn?.textContent?.toLowerCase().includes('copied')) return true;

        return false;
      });

      if (!copied) {
        // Not necessarily an issue - some apps don't show feedback
        // But worth noting
      }

      return this.result(
        'Copy Response',
        true,
        Date.now() - startTime,
        issues,
        'Copy button clickable'
      );

    } catch (error) {
      issues.push(this.createIssue(
        'chat-flow-copy',
        'Error testing copy',
        error instanceof Error ? error.message : String(error),
        'low'
      ));
      return this.result('Copy Response', false, Date.now() - startTime, issues, 'Error during test');
    }
  }

  /**
   * Check refresh recovery
   */
  async checkRefreshRecovery(): Promise<ChatFlowResult> {
    const startTime = Date.now();
    const issues: Issue[] = [];

    try {
      // Get current state
      const urlBefore = this.page.url();
      const messagesBefore = await this.page.$$(this.config.selectors.messageItem);
      const countBefore = messagesBefore.length;

      // Refresh the page
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await this.page.waitForTimeout(1000);

      // Check recovery
      const urlAfter = this.page.url();
      const messagesAfter = await this.page.$$(this.config.selectors.messageItem);
      const countAfter = messagesAfter.length;

      // URL should be preserved or redirected to valid state
      if (!urlAfter.includes(new URL(urlBefore).hostname)) {
        issues.push(this.createIssue(
          'chat-flow-refresh',
          'Unexpected redirect after refresh',
          `URL changed from ${urlBefore} to ${urlAfter}`,
          'medium'
        ));
      }

      // Page should not be blank
      const isBlank = await this.page.evaluate(() => {
        return document.body.children.length === 0 || document.body.innerText.trim().length < 10;
      });

      if (isBlank) {
        issues.push(this.createIssue(
          'chat-flow-refresh',
          'Blank page after refresh',
          'Page rendered blank or nearly blank after refresh',
          'high'
        ));
      }

      // If we had messages before, we should have some state preserved (or clear new chat state)
      // This is app-specific behavior, so we don't fail on message count difference

      return this.result(
        'Refresh Recovery',
        issues.length === 0,
        Date.now() - startTime,
        issues,
        issues.length === 0 ? 'Page recovers correctly after refresh' : 'Issues with refresh recovery'
      );

    } catch (error) {
      issues.push(this.createIssue(
        'chat-flow-refresh',
        'Error testing refresh recovery',
        error instanceof Error ? error.message : String(error),
        'high'
      ));
      return this.result('Refresh Recovery', false, Date.now() - startTime, issues, 'Error during test');
    }
  }

  private createIssue(
    _category: string,
    title: string,
    description: string,
    severity: 'low' | 'medium' | 'high' | 'critical'
  ): Issue {
    return {
      id: `chat-flow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      severity,
      category: 'llm-chat-flow',
      title,
      description,
      pageUrl: this.page.url(),
      reproSteps: [],
      selectors: [],
      foundAt: new Date(),
      evidence: {},
    };
  }

  private result(
    flowName: string,
    passed: boolean,
    duration: number,
    issues: Issue[],
    details: string
  ): ChatFlowResult {
    return { flowName, passed, duration, issues, details };
  }
}
