/**
 * Issue severity scoring utilities
 */

import type { IssueCategory, IssueSeverity } from '../types.js';

/**
 * Default severity mappings for issue categories
 */
const CATEGORY_SEVERITY: Record<IssueCategory, IssueSeverity> = {
  'form-validation': 'high',
  'form-required': 'high',
  'form-invalid-input': 'medium',
  'broken-link': 'high',
  'console-error': 'medium',
  'network-error': 'high',
  'a11y-missing-label': 'medium',
  'a11y-missing-name': 'medium',
  'a11y-focus-trap': 'high',
  // LLM Chat Testing Categories
  'llm-streaming': 'high',
  'llm-chat-flow': 'high',
  'llm-prompt-corpus': 'medium',
  'llm-chaos': 'high',
  'llm-reliability': 'high',
  'llm-performance': 'medium',
  other: 'low',
};

/**
 * Get default severity for an issue category
 */
export function getDefaultSeverity(category: IssueCategory): IssueSeverity {
  return CATEGORY_SEVERITY[category] || 'medium';
}

/**
 * Severity ranking (higher number = more severe)
 */
const SEVERITY_RANK: Record<IssueSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

/**
 * Compare two severities
 * Returns positive if a is more severe, negative if b is more severe, 0 if equal
 */
export function compareSeverity(a: IssueSeverity, b: IssueSeverity): number {
  return SEVERITY_RANK[a] - SEVERITY_RANK[b];
}

/**
 * Get severity rank as a number
 */
export function getSeverityRank(severity: IssueSeverity): number {
  return SEVERITY_RANK[severity];
}

/**
 * Upgrade severity based on context
 */
export function upgradeSeverity(
  baseSeverity: IssueSeverity,
  conditions: {
    isOnHomepage?: boolean;
    affectsMultiplePages?: boolean;
    isSecurityRelated?: boolean;
    blocksUserFlow?: boolean;
  }
): IssueSeverity {
  let rank = SEVERITY_RANK[baseSeverity];

  if (conditions.isSecurityRelated) {
    rank = Math.min(SEVERITY_RANK.critical, rank + 2);
  }
  if (conditions.blocksUserFlow) {
    rank = Math.min(SEVERITY_RANK.critical, rank + 1);
  }
  if (conditions.isOnHomepage && rank < SEVERITY_RANK.high) {
    rank = Math.min(SEVERITY_RANK.high, rank + 1);
  }
  if (conditions.affectsMultiplePages && rank < SEVERITY_RANK.high) {
    rank = Math.min(SEVERITY_RANK.high, rank + 1);
  }

  // Convert rank back to severity
  const entries = Object.entries(SEVERITY_RANK) as [IssueSeverity, number][];
  const match = entries.find(([, r]) => r === rank);
  return match ? match[0] : baseSeverity;
}

/**
 * Get severity color for terminal output
 */
export function getSeverityColor(severity: IssueSeverity): string {
  const colors: Record<IssueSeverity, string> = {
    critical: 'red',
    high: 'red',
    medium: 'yellow',
    low: 'blue',
    info: 'gray',
  };
  return colors[severity];
}

/**
 * Get severity emoji for reports
 */
export function getSeverityEmoji(severity: IssueSeverity): string {
  const emojis: Record<IssueSeverity, string> = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🔵',
    info: '⚪',
  };
  return emojis[severity];
}
