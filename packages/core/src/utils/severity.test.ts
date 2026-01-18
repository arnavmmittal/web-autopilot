import { describe, it, expect } from 'vitest';

import {
  getDefaultSeverity,
  compareSeverity,
  getSeverityRank,
  upgradeSeverity,
} from './severity.js';

describe('getDefaultSeverity', () => {
  it('should return high for broken links', () => {
    expect(getDefaultSeverity('broken-link')).toBe('high');
  });

  it('should return medium for console errors', () => {
    expect(getDefaultSeverity('console-error')).toBe('medium');
  });

  it('should return low for other category', () => {
    expect(getDefaultSeverity('other')).toBe('low');
  });
});

describe('compareSeverity', () => {
  it('should return positive when first is more severe', () => {
    expect(compareSeverity('critical', 'high')).toBeGreaterThan(0);
    expect(compareSeverity('high', 'medium')).toBeGreaterThan(0);
  });

  it('should return negative when second is more severe', () => {
    expect(compareSeverity('low', 'high')).toBeLessThan(0);
    expect(compareSeverity('info', 'critical')).toBeLessThan(0);
  });

  it('should return 0 for equal severities', () => {
    expect(compareSeverity('medium', 'medium')).toBe(0);
  });
});

describe('getSeverityRank', () => {
  it('should return correct ranks', () => {
    expect(getSeverityRank('critical')).toBe(5);
    expect(getSeverityRank('high')).toBe(4);
    expect(getSeverityRank('medium')).toBe(3);
    expect(getSeverityRank('low')).toBe(2);
    expect(getSeverityRank('info')).toBe(1);
  });
});

describe('upgradeSeverity', () => {
  it('should upgrade severity for security issues', () => {
    expect(upgradeSeverity('low', { isSecurityRelated: true })).toBe('high');
  });

  it('should upgrade severity for user flow blockers', () => {
    expect(upgradeSeverity('medium', { blocksUserFlow: true })).toBe('high');
  });

  it('should not exceed critical', () => {
    expect(
      upgradeSeverity('high', {
        isSecurityRelated: true,
        blocksUserFlow: true,
        isOnHomepage: true,
      })
    ).toBe('critical');
  });

  it('should handle homepage issues', () => {
    expect(upgradeSeverity('low', { isOnHomepage: true })).toBe('medium');
  });
});
