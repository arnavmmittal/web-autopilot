/**
 * Markdown Report Writer - GitHub issue-ready output (bugs.md)
 */

import { writeFile } from 'fs/promises';
import { relative, dirname } from 'path';

import type { Report, Issue, IssueSeverity } from '../types.js';

const SEVERITY_EMOJI: Record<IssueSeverity, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
  info: '⚪',
};

export class MarkdownReportWriter {
  /**
   * Write report to Markdown file
   */
  async write(report: Report, filepath: string): Promise<void> {
    const md = this.generateMarkdown(report, filepath);
    await writeFile(filepath, md, 'utf-8');
  }

  /**
   * Generate the full markdown content
   */
  private generateMarkdown(report: Report, filepath: string): string {
    const lines: string[] = [];
    const reportDir = dirname(filepath);

    // Header
    lines.push(`# ${report.meta.title}`);
    lines.push('');
    lines.push(`**Generated:** ${report.meta.generatedAt.toISOString()}`);
    lines.push(`**Tool Version:** web-autopilot v${report.meta.version}`);
    lines.push(`**Target URL:** ${report.meta.config.url}`);
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push('');
    lines.push(`- **Pages Visited:** ${report.summary.totalPagesVisited}`);
    lines.push(`- **Forms Discovered:** ${report.summary.formsDiscovered}`);
    lines.push(`- **Total Issues:** ${report.summary.totalIssues}`);
    lines.push(`- **Duration:** ${(report.summary.durationMs / 1000).toFixed(1)}s`);
    lines.push('');

    // Issues by severity
    lines.push('### Issues by Severity');
    lines.push('');
    lines.push('| Severity | Count |');
    lines.push('|----------|-------|');
    for (const severity of ['critical', 'high', 'medium', 'low', 'info'] as IssueSeverity[]) {
      const count = report.summary.issuesBySeverity[severity] || 0;
      if (count > 0) {
        lines.push(`| ${SEVERITY_EMOJI[severity]} ${severity} | ${count} |`);
      }
    }
    lines.push('');

    // AI Summary (if available)
    if (report.aiSummary) {
      lines.push('## AI Analysis');
      lines.push('');
      lines.push(report.aiSummary.executiveSummary);
      lines.push('');

      if (report.aiSummary.topRisks.length > 0) {
        lines.push('### Top Risks');
        lines.push('');
        for (const risk of report.aiSummary.topRisks) {
          lines.push(`- ${risk}`);
        }
        lines.push('');
      }
    }

    // Issues
    lines.push('---');
    lines.push('');
    lines.push('## Issues');
    lines.push('');

    // Group issues by category
    const issuesByCategory = new Map<string, Issue[]>();
    for (const issue of report.issues) {
      const category = issue.category;
      const issues = issuesByCategory.get(category) || [];
      issues.push(issue);
      issuesByCategory.set(category, issues);
    }

    for (const [category, issues] of issuesByCategory) {
      lines.push(`### ${this.formatCategory(category)} (${issues.length})`);
      lines.push('');

      for (const issue of issues) {
        lines.push(this.formatIssue(issue, reportDir));
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Format a category name for display
   */
  private formatCategory(category: string): string {
    return category
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Format a single issue as markdown
   */
  private formatIssue(issue: Issue, reportDir: string): string {
    const lines: string[] = [];

    // Title with severity
    lines.push(`#### ${SEVERITY_EMOJI[issue.severity]} ${issue.title}`);
    lines.push('');

    // Environment
    lines.push('<details>');
    lines.push('<summary>Details</summary>');
    lines.push('');

    lines.push('**Environment:**');
    lines.push(`- Issue ID: \`${issue.id}\``);
    lines.push(`- Page: ${issue.pageUrl}`);
    lines.push(`- Found: ${issue.foundAt.toISOString()}`);
    lines.push('');

    // Description
    lines.push('**Description:**');
    lines.push(issue.description);
    lines.push('');

    // Reproduction steps
    if (issue.reproSteps.length > 0) {
      lines.push('**Steps to Reproduce:**');
      for (let i = 0; i < issue.reproSteps.length; i++) {
        lines.push(`${i + 1}. ${issue.reproSteps[i]}`);
      }
      lines.push('');
    }

    // Expected vs Actual
    if (issue.expectedBehavior) {
      lines.push(`**Expected:** ${issue.expectedBehavior}`);
    }
    if (issue.actualBehavior) {
      lines.push(`**Actual:** ${issue.actualBehavior}`);
    }
    if (issue.expectedBehavior || issue.actualBehavior) {
      lines.push('');
    }

    // Evidence
    if (issue.screenshotPath) {
      const relPath = relative(reportDir, issue.screenshotPath);
      lines.push(`**Screenshot:** ![screenshot](${relPath})`);
      lines.push('');
    }

    if (issue.consoleSnippet) {
      lines.push('**Console Output:**');
      lines.push('```');
      lines.push(issue.consoleSnippet.slice(0, 500));
      lines.push('```');
      lines.push('');
    }

    if (issue.networkSnippet) {
      lines.push('**Network Info:**');
      lines.push('```');
      lines.push(issue.networkSnippet.slice(0, 500));
      lines.push('```');
      lines.push('');
    }

    // Suggested fix
    if (issue.suggestedFix) {
      lines.push(`**Suggested Fix:** ${issue.suggestedFix}`);
      lines.push('');
    }

    if (issue.aiSuggestedFix) {
      lines.push(`**AI Suggested Fix:** ${issue.aiSuggestedFix}`);
      lines.push('');
    }

    lines.push('</details>');
    lines.push('');

    return lines.join('\n');
  }
}
