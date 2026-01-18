/**
 * HTML Report Writer - human-friendly output
 */

import { writeFile } from 'fs/promises';
import { relative, dirname } from 'path';

import type { Report, Issue, IssueSeverity } from '../types.js';

const SEVERITY_COLORS: Record<IssueSeverity, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#2563eb',
  info: '#6b7280',
};

export class HtmlReportWriter {
  /**
   * Write report to HTML file
   */
  async write(report: Report, filepath: string): Promise<void> {
    const html = this.generateHtml(report, filepath);
    await writeFile(filepath, html, 'utf-8');
  }

  /**
   * Generate the full HTML content
   */
  private generateHtml(report: Report, filepath: string): string {
    const reportDir = dirname(filepath);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(report.meta.title)}</title>
  <style>
    :root {
      --bg-primary: #0f172a;
      --bg-secondary: #1e293b;
      --bg-tertiary: #334155;
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --border-color: #475569;
      --accent: #3b82f6;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      padding: 2rem;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    header {
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--border-color);
    }

    h1 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }

    .meta {
      color: var(--text-secondary);
      font-size: 0.875rem;
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: var(--bg-secondary);
      padding: 1.5rem;
      border-radius: 0.5rem;
      border: 1px solid var(--border-color);
    }

    .stat-value {
      font-size: 2rem;
      font-weight: bold;
      color: var(--accent);
    }

    .stat-label {
      color: var(--text-secondary);
      font-size: 0.875rem;
    }

    .severity-chart {
      display: flex;
      gap: 0.5rem;
      margin: 1rem 0;
    }

    .severity-bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.875rem;
      font-weight: 500;
    }

    .issues-section {
      margin-top: 2rem;
    }

    .category-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 1.5rem 0 1rem;
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--border-color);
    }

    .issue-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 0.5rem;
      margin-bottom: 1rem;
      overflow: hidden;
    }

    .issue-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem;
      cursor: pointer;
      transition: background 0.2s;
    }

    .issue-header:hover {
      background: var(--bg-tertiary);
    }

    .severity-badge {
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      color: white;
    }

    .issue-title {
      flex: 1;
      font-weight: 500;
    }

    .issue-url {
      color: var(--text-secondary);
      font-size: 0.75rem;
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .issue-details {
      display: none;
      padding: 1rem;
      border-top: 1px solid var(--border-color);
      background: var(--bg-primary);
    }

    .issue-card.expanded .issue-details {
      display: block;
    }

    .detail-section {
      margin-bottom: 1rem;
    }

    .detail-label {
      color: var(--text-secondary);
      font-size: 0.75rem;
      text-transform: uppercase;
      margin-bottom: 0.25rem;
    }

    .steps-list {
      list-style-position: inside;
      color: var(--text-secondary);
    }

    .steps-list li {
      margin-bottom: 0.25rem;
    }

    pre {
      background: var(--bg-tertiary);
      padding: 0.75rem;
      border-radius: 0.25rem;
      overflow-x: auto;
      font-size: 0.875rem;
      color: var(--text-secondary);
    }

    .screenshot {
      max-width: 100%;
      border-radius: 0.25rem;
      margin-top: 0.5rem;
    }

    .ai-summary {
      background: linear-gradient(135deg, #1e3a5f 0%, #1e293b 100%);
      border: 1px solid #3b82f6;
      border-radius: 0.5rem;
      padding: 1.5rem;
      margin-bottom: 2rem;
    }

    .ai-summary h2 {
      color: #60a5fa;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .pages-section {
      margin-top: 2rem;
    }

    .page-list {
      display: grid;
      gap: 0.5rem;
    }

    .page-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: var(--bg-secondary);
      border-radius: 0.25rem;
      font-size: 0.875rem;
    }

    .page-status {
      font-weight: 600;
    }

    .page-status.ok { color: #22c55e; }
    .page-status.error { color: #ef4444; }

    footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border-color);
      color: var(--text-secondary);
      font-size: 0.75rem;
      text-align: center;
    }

    footer a {
      color: var(--accent);
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${this.escapeHtml(report.meta.title)}</h1>
      <div class="meta">
        Generated: ${new Date(report.meta.generatedAt).toLocaleString()} |
        Target: <a href="${this.escapeHtml(report.meta.config.url)}" style="color: var(--accent)">${this.escapeHtml(report.meta.config.url)}</a> |
        Duration: ${(report.summary.durationMs / 1000).toFixed(1)}s
      </div>
    </header>

    <section class="summary">
      <div class="stat-card">
        <div class="stat-value">${report.summary.totalPagesVisited}</div>
        <div class="stat-label">Pages Visited</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${report.summary.formsDiscovered}</div>
        <div class="stat-label">Forms Discovered</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${report.summary.totalIssues}</div>
        <div class="stat-label">Issues Found</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${report.summary.brokenLinksFound}</div>
        <div class="stat-label">Broken Links</div>
      </div>
    </section>

    <div class="severity-chart">
      ${this.renderSeverityBars(report)}
    </div>

    ${report.aiSummary ? this.renderAISummary(report.aiSummary) : ''}

    <section class="issues-section">
      <h2>Issues (${report.issues.length})</h2>
      ${this.renderIssues(report.issues, reportDir)}
    </section>

    <section class="pages-section">
      <h2>Pages Visited (${report.crawl.pages.length})</h2>
      <div class="page-list">
        ${report.crawl.pages
          .slice(0, 50)
          .map(
            (page) => `
          <div class="page-item">
            <span class="page-status ${page.statusCode >= 200 && page.statusCode < 400 ? 'ok' : 'error'}">${page.statusCode}</span>
            <span>${this.escapeHtml(page.title || page.url)}</span>
            <span style="color: var(--text-secondary); margin-left: auto;">${page.loadTimeMs}ms</span>
          </div>
        `
          )
          .join('')}
        ${report.crawl.pages.length > 50 ? `<div class="page-item" style="justify-content: center; color: var(--text-secondary);">+ ${report.crawl.pages.length - 50} more pages</div>` : ''}
      </div>
    </section>

    <footer>
      Generated by <a href="https://github.com/web-autopilot/web-autopilot">Web Autopilot</a> v${report.meta.version}
    </footer>
  </div>

  <script>
    document.querySelectorAll('.issue-header').forEach(header => {
      header.addEventListener('click', () => {
        header.closest('.issue-card').classList.toggle('expanded');
      });
    });
  </script>
</body>
</html>`;
  }

  /**
   * Render severity bars
   */
  private renderSeverityBars(report: Report): string {
    const severities: IssueSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
    return severities
      .filter((s) => (report.summary.issuesBySeverity[s] || 0) > 0)
      .map(
        (severity) => `
        <span class="severity-bar" style="background: ${SEVERITY_COLORS[severity]}">
          ${severity}: ${report.summary.issuesBySeverity[severity]}
        </span>
      `
      )
      .join('');
  }

  /**
   * Render AI summary section
   */
  private renderAISummary(aiSummary: Report['aiSummary']): string {
    if (!aiSummary) return '';

    return `
      <section class="ai-summary">
        <h2>✨ AI Analysis</h2>
        <p>${this.escapeHtml(aiSummary.executiveSummary)}</p>
        ${
          aiSummary.topRisks.length > 0
            ? `
          <h3 style="margin-top: 1rem; margin-bottom: 0.5rem;">Top Risks</h3>
          <ul style="padding-left: 1.5rem; color: var(--text-secondary);">
            ${aiSummary.topRisks.map((risk) => `<li>${this.escapeHtml(risk)}</li>`).join('')}
          </ul>
        `
            : ''
        }
      </section>
    `;
  }

  /**
   * Render issues grouped by category
   */
  private renderIssues(issues: Issue[], reportDir: string): string {
    const grouped = new Map<string, Issue[]>();
    for (const issue of issues) {
      const list = grouped.get(issue.category) || [];
      list.push(issue);
      grouped.set(issue.category, list);
    }

    let html = '';
    for (const [category, categoryIssues] of grouped) {
      html += `
        <div class="category-header">
          <h3>${this.formatCategory(category)}</h3>
          <span style="color: var(--text-secondary)">(${categoryIssues.length})</span>
        </div>
      `;

      for (const issue of categoryIssues) {
        html += this.renderIssueCard(issue, reportDir);
      }
    }

    return html;
  }

  /**
   * Render a single issue card
   */
  private renderIssueCard(issue: Issue, reportDir: string): string {
    return `
      <div class="issue-card">
        <div class="issue-header">
          <span class="severity-badge" style="background: ${SEVERITY_COLORS[issue.severity]}">${issue.severity}</span>
          <span class="issue-title">${this.escapeHtml(issue.title)}</span>
          <span class="issue-url">${this.escapeHtml(issue.pageUrl)}</span>
        </div>
        <div class="issue-details">
          <div class="detail-section">
            <div class="detail-label">Description</div>
            <p>${this.escapeHtml(issue.description)}</p>
          </div>

          ${
            issue.reproSteps.length > 0
              ? `
            <div class="detail-section">
              <div class="detail-label">Steps to Reproduce</div>
              <ol class="steps-list">
                ${issue.reproSteps.map((step) => `<li>${this.escapeHtml(step)}</li>`).join('')}
              </ol>
            </div>
          `
              : ''
          }

          ${
            issue.expectedBehavior || issue.actualBehavior
              ? `
            <div class="detail-section">
              ${issue.expectedBehavior ? `<p><strong>Expected:</strong> ${this.escapeHtml(issue.expectedBehavior)}</p>` : ''}
              ${issue.actualBehavior ? `<p><strong>Actual:</strong> ${this.escapeHtml(issue.actualBehavior)}</p>` : ''}
            </div>
          `
              : ''
          }

          ${
            issue.consoleSnippet
              ? `
            <div class="detail-section">
              <div class="detail-label">Console Output</div>
              <pre>${this.escapeHtml(issue.consoleSnippet.slice(0, 500))}</pre>
            </div>
          `
              : ''
          }

          ${
            issue.screenshotPath
              ? `
            <div class="detail-section">
              <div class="detail-label">Screenshot</div>
              <img class="screenshot" src="${relative(reportDir, issue.screenshotPath)}" alt="Screenshot" />
            </div>
          `
              : ''
          }

          ${
            issue.suggestedFix || issue.aiSuggestedFix
              ? `
            <div class="detail-section">
              <div class="detail-label">Suggested Fix</div>
              <p>${this.escapeHtml(issue.aiSuggestedFix || issue.suggestedFix || '')}</p>
            </div>
          `
              : ''
          }
        </div>
      </div>
    `;
  }

  /**
   * Format category name
   */
  private formatCategory(category: string): string {
    return category
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
