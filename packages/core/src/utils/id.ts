/**
 * ID generation utilities
 */

import { randomBytes } from 'crypto';

/**
 * Generate a unique issue ID
 */
export function generateIssueId(): string {
  return `issue-${randomBytes(6).toString('hex')}`;
}

/**
 * Generate a unique page ID
 */
export function generatePageId(): string {
  return `page-${randomBytes(6).toString('hex')}`;
}

/**
 * Generate a unique run ID
 */
export function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  return `run-${timestamp}-${random}`;
}
