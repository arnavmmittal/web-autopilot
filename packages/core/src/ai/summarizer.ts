/**
 * AI Summarizer - uses OpenAI to generate executive summaries and suggested fixes
 */

import OpenAI from 'openai';

import type { Issue, ReportSummary, AISummary, IssueSeverity } from '../types.js';
import { redactSensitiveParams } from '../utils/url.js';

export class AISummarizer {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Generate an AI summary of the report
   */
  async summarize(issues: Issue[], summary: ReportSummary): Promise<AISummary> {
    // Prepare a concise representation of issues
    const issuesSummary = this.prepareIssuesSummary(issues);

    const prompt = this.buildPrompt(issuesSummary, summary);

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a web application security and quality analyst. Analyze the following web testing results and provide:
1. A brief executive summary (2-3 sentences) of the overall findings
2. Top 3-5 risks or issues that need immediate attention
3. Suggested fixes for the most critical issues

Be concise and actionable. Focus on security implications and user experience impact.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content || '';
      return this.parseResponse(content, issues);
    } catch (error) {
      // Return a minimal summary if AI fails
      return this.getFallbackSummary(issues, summary);
    }
  }

  /**
   * Prepare a concise summary of issues for the AI
   */
  private prepareIssuesSummary(issues: Issue[]): string {
    const grouped: Record<string, Issue[]> = {};

    for (const issue of issues) {
      if (!grouped[issue.category]) {
        grouped[issue.category] = [];
      }
      grouped[issue.category].push(issue);
    }

    const lines: string[] = [];

    for (const [category, categoryIssues] of Object.entries(grouped)) {
      lines.push(`## ${category} (${categoryIssues.length} issues)`);

      // Include details of top issues per category (max 3)
      const topIssues = this.sortBySeverity(categoryIssues).slice(0, 3);
      for (const issue of topIssues) {
        const url = redactSensitiveParams(issue.pageUrl);
        lines.push(`- [${issue.severity}] ${issue.title}`);
        lines.push(`  URL: ${url}`);
        if (issue.description) {
          lines.push(`  Details: ${issue.description.slice(0, 150)}`);
        }
      }

      if (categoryIssues.length > 3) {
        lines.push(`  ... and ${categoryIssues.length - 3} more`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Build the prompt for the AI
   */
  private buildPrompt(issuesSummary: string, summary: ReportSummary): string {
    return `
Web Testing Report Summary:
- Pages Visited: ${summary.totalPagesVisited}
- Forms Discovered: ${summary.formsDiscovered}
- Total Issues: ${summary.totalIssues}
- Critical Issues: ${summary.issuesBySeverity.critical || 0}
- High Issues: ${summary.issuesBySeverity.high || 0}
- Medium Issues: ${summary.issuesBySeverity.medium || 0}
- Low Issues: ${summary.issuesBySeverity.low || 0}

Issues Found:
${issuesSummary}

Please analyze these findings and provide:
1. Executive Summary: A brief overview of the site's quality and security posture
2. Top Risks: The most critical issues that need immediate attention
3. Suggested Fixes: Specific recommendations for the critical issues
`.trim();
  }

  /**
   * Parse the AI response into structured format
   */
  private parseResponse(content: string, issues: Issue[]): AISummary {
    // Extract sections from the response
    const executiveSummary = this.extractSection(content, 'Executive Summary', 'Top Risks');
    const topRisksText = this.extractSection(content, 'Top Risks', 'Suggested Fixes');
    const suggestedFixesText = this.extractSection(content, 'Suggested Fixes', null);

    // Parse top risks as bullet points
    const topRisks = topRisksText
      .split('\n')
      .filter((line) => line.trim().startsWith('-') || line.trim().match(/^\d+\./))
      .map((line) => line.replace(/^[-\d.]+\s*/, '').trim())
      .filter((line) => line.length > 0)
      .slice(0, 5);

    // Parse suggested fixes and map to issues
    const suggestedFixes = this.parseSuggestedFixes(suggestedFixesText, issues);

    // Calculate health score based on issues
    const healthScore = this.calculateHealthScore(issues);

    return {
      executiveSummary: executiveSummary || 'Analysis could not be generated.',
      topRisks,
      suggestedFixes,
      overallHealthScore: healthScore,
    };
  }

  /**
   * Extract a section from the AI response
   */
  private extractSection(content: string, start: string, end: string | null): string {
    const startIndex = content.indexOf(start);
    if (startIndex === -1) return '';

    const sectionStart = startIndex + start.length;
    let sectionEnd = content.length;

    if (end) {
      const endIndex = content.indexOf(end, sectionStart);
      if (endIndex !== -1) {
        sectionEnd = endIndex;
      }
    }

    return content.slice(sectionStart, sectionEnd).trim().replace(/^[:\s]+/, '');
  }

  /**
   * Parse suggested fixes and map to issue IDs
   */
  private parseSuggestedFixes(
    text: string,
    issues: Issue[]
  ): AISummary['suggestedFixes'] {
    const fixes: AISummary['suggestedFixes'] = [];
    const lines = text.split('\n').filter((l) => l.trim());

    // Try to match fixes to issues by looking for keywords
    let currentFix = '';
    let bestMatch: Issue | null = null;

    for (const line of lines) {
      if (line.trim().startsWith('-') || line.trim().match(/^\d+\./)) {
        // New fix
        if (currentFix && bestMatch) {
          fixes.push({
            issueId: bestMatch.id,
            suggestion: currentFix.trim(),
          });
        }

        currentFix = line.replace(/^[-\d.]+\s*/, '').trim();
        bestMatch = this.findMatchingIssue(currentFix, issues);
      } else {
        currentFix += ' ' + line.trim();
      }
    }

    // Add last fix
    if (currentFix && bestMatch) {
      fixes.push({
        issueId: bestMatch.id,
        suggestion: currentFix.trim(),
      });
    }

    return fixes.slice(0, 10);
  }

  /**
   * Find an issue that matches the fix description
   */
  private findMatchingIssue(fixText: string, issues: Issue[]): Issue | null {
    const fixLower = fixText.toLowerCase();

    // Sort by severity (critical first) and find first match
    const sorted = this.sortBySeverity(issues);

    for (const issue of sorted) {
      const titleLower = issue.title.toLowerCase();
      const categoryLower = issue.category.toLowerCase();

      // Check for keyword overlap
      const keywords = titleLower.split(/\s+/).filter((w) => w.length > 3);
      const hasKeywordMatch = keywords.some((kw) => fixLower.includes(kw));

      if (hasKeywordMatch || fixLower.includes(categoryLower.replace(/-/g, ' '))) {
        return issue;
      }
    }

    // Return highest severity issue as fallback
    return sorted[0] || null;
  }

  /**
   * Sort issues by severity
   */
  private sortBySeverity(issues: Issue[]): Issue[] {
    const order: Record<IssueSeverity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      info: 4,
    };

    return [...issues].sort((a, b) => order[a.severity] - order[b.severity]);
  }

  /**
   * Calculate overall health score (0-100)
   */
  private calculateHealthScore(issues: Issue[]): number {
    if (issues.length === 0) return 100;

    // Weighted penalty per severity
    const penalties: Record<IssueSeverity, number> = {
      critical: 25,
      high: 15,
      medium: 8,
      low: 3,
      info: 1,
    };

    let totalPenalty = 0;
    for (const issue of issues) {
      totalPenalty += penalties[issue.severity];
    }

    // Cap penalty at 100
    return Math.max(0, 100 - Math.min(100, totalPenalty));
  }

  /**
   * Generate fallback summary when AI is unavailable
   */
  private getFallbackSummary(issues: Issue[], summary: ReportSummary): AISummary {
    const criticalCount = summary.issuesBySeverity.critical || 0;
    const highCount = summary.issuesBySeverity.high || 0;

    let executiveSummary =
      `Automated analysis found ${summary.totalIssues} issues across ${summary.totalPagesVisited} pages. `;

    if (criticalCount > 0) {
      executiveSummary += `${criticalCount} critical issue(s) require immediate attention. `;
    } else if (highCount > 0) {
      executiveSummary += `${highCount} high-priority issue(s) should be addressed soon. `;
    } else {
      executiveSummary += 'No critical issues were found. ';
    }

    const topIssues = this.sortBySeverity(issues).slice(0, 5);
    const topRisks = topIssues.map(
      (issue) => `[${issue.severity.toUpperCase()}] ${issue.title}`
    );

    return {
      executiveSummary,
      topRisks,
      suggestedFixes: topIssues
        .filter((i) => i.suggestedFix)
        .map((i) => ({
          issueId: i.id,
          suggestion: i.suggestedFix!,
        })),
      overallHealthScore: this.calculateHealthScore(issues),
    };
  }
}
