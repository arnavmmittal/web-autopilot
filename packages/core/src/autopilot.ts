/**
 * Main WebAutopilot orchestrator
 */

import { mkdir } from 'fs/promises';
import { join } from 'path';

import { chromium, Browser, BrowserContext } from 'playwright';

import { AISummarizer } from './ai/summarizer.js';
import { Crawler } from './crawler/crawler.js';
import { EvidenceCollector } from './evidence/collector.js';
import { FormTester } from './forms/tester.js';
import { LinkChecker } from './links/checker.js';
import { A11yChecker } from './a11y/checker.js';
import { HtmlReportWriter, JsonReportWriter, MarkdownReportWriter } from './reports/index.js';
import type {
  RunConfig,
  Report,
  ReportMeta,
  ReportSummary,
  Issue,
  CrawlResult,
  PageInfo,
  GoalPreset,
  AutopilotEvent,
  EventCallback,
  IssueCategory,
  IssueSeverity,
} from './types.js';
import { generateRunId } from './utils/id.js';

export class WebAutopilot {
  private config: RunConfig;
  private browser?: Browser;
  private context?: BrowserContext;
  private issues: Issue[] = [];
  private startTime?: Date;
  private eventListeners: Map<string, EventCallback[]> = new Map();
  private runId: string;

  constructor(config: RunConfig) {
    this.config = config;
    this.runId = generateRunId();
  }

  /**
   * Register an event listener
   */
  on(event: string, callback: EventCallback): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.push(callback);
    this.eventListeners.set(event, listeners);
  }

  /**
   * Emit an event
   */
  private emit(type: AutopilotEvent['type'], data: unknown): void {
    const event: AutopilotEvent = {
      type,
      timestamp: new Date(),
      data,
    };

    const listeners = this.eventListeners.get(type) || [];
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Run the full automation pipeline
   */
  async run(): Promise<Report> {
    this.startTime = new Date();
    this.emit('start', { config: this.config });

    try {
      // Ensure output directories exist
      await this.ensureOutputDirs();

      // Launch browser
      this.browser = await chromium.launch({
        headless: !this.config.headed,
      });

      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent:
          'Mozilla/5.0 (compatible; WebAutopilot/0.1; +https://github.com/web-autopilot)',
      });

      // Run crawl
      const crawlResult = await this.crawl();

      // Run tests based on goals
      await this.runTests(crawlResult);

      // Generate report
      const report = await this.generateReport(crawlResult);

      // Write reports
      await this.writeReports(report);

      this.emit('complete', { report });

      return report;
    } catch (error) {
      this.emit('error', { error });
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Ensure output directories exist
   */
  private async ensureOutputDirs(): Promise<void> {
    await mkdir(this.config.outputDir, { recursive: true });
    await mkdir(join(this.config.outputDir, 'artifacts'), { recursive: true });
    await mkdir(join(this.config.outputDir, 'artifacts', 'screenshots'), { recursive: true });
    await mkdir(join(this.config.outputDir, 'artifacts', 'traces'), { recursive: true });
  }

  /**
   * Crawl the target site
   */
  private async crawl(): Promise<CrawlResult> {
    const crawler = new Crawler({
      context: this.context!,
      config: this.config,
      onPageVisit: (url, current, total) => {
        this.emit('page-visit', { url, current, total });
      },
      onFormFound: (count) => {
        this.emit('form-found', { count });
      },
      onConsoleError: (error) => {
        // Console errors are captured per-page
      },
      onNetworkError: (error) => {
        // Network errors are captured per-page
      },
    });

    return crawler.crawl(this.config.url);
  }

  /**
   * Check if a goal is active
   */
  private hasGoal(preset: GoalPreset): boolean {
    return this.config.goals.some(
      (goal) =>
        (goal.type === 'preset' && (goal.value === preset || goal.value === 'full')) ||
        (goal.type === 'custom' && goal.value.toLowerCase().includes(preset))
    );
  }

  /**
   * Run tests based on configured goals
   */
  private async runTests(crawlResult: CrawlResult): Promise<void> {
    const evidenceCollector = new EvidenceCollector({
      outputDir: this.config.outputDir,
      runId: this.runId,
    });

    // Form testing
    if (this.hasGoal('forms')) {
      await this.testForms(crawlResult.pages, evidenceCollector);
    }

    // Link checking
    if (this.hasGoal('links')) {
      await this.checkLinks(crawlResult.pages, evidenceCollector);
    }

    // Console/Network error issues
    if (this.hasGoal('console')) {
      await this.processConsoleErrors(crawlResult.pages, evidenceCollector);
    }

    // Accessibility checks
    if (this.hasGoal('a11y-lite')) {
      await this.checkAccessibility(crawlResult.pages, evidenceCollector);
    }
  }

  /**
   * Test forms on all pages
   */
  private async testForms(pages: PageInfo[], evidenceCollector: EvidenceCollector): Promise<void> {
    const formTester = new FormTester({
      context: this.context!,
      config: this.config,
      evidenceCollector,
      onIssue: (issue) => {
        this.issues.push(issue);
        this.emit('issue-found', { category: issue.category, title: issue.title });
      },
    });

    let formCount = 0;
    const totalForms = pages.reduce((sum, page) => sum + page.forms.length, 0);

    for (const page of pages) {
      for (const form of page.forms) {
        formCount++;
        this.emit('form-test-start', { formIndex: formCount, total: totalForms });
        await formTester.testForm(page.url, form);
        this.emit('form-test-complete', { formIndex: formCount, total: totalForms });
      }
    }
  }

  /**
   * Check links on all pages
   */
  private async checkLinks(pages: PageInfo[], evidenceCollector: EvidenceCollector): Promise<void> {
    const linkChecker = new LinkChecker({
      context: this.context!,
      config: this.config,
      evidenceCollector,
      onProgress: (checked, total) => {
        this.emit('link-check', { checked, total });
      },
      onIssue: (issue) => {
        this.issues.push(issue);
        this.emit('issue-found', { category: issue.category, title: issue.title });
      },
    });

    await linkChecker.checkPages(pages);
  }

  /**
   * Process console and network errors into issues
   */
  private async processConsoleErrors(
    pages: PageInfo[],
    evidenceCollector: EvidenceCollector
  ): Promise<void> {
    for (const page of pages) {
      // Console errors
      for (const error of page.consoleErrors) {
        const issue = await evidenceCollector.createIssue({
          category: 'console-error',
          title: `Console ${error.type}: ${error.message.slice(0, 50)}`,
          description: `Console ${error.type} on page`,
          pageUrl: page.url,
          consoleSnippet: error.message,
          severity: error.type === 'pageerror' ? 'high' : 'medium',
        });
        this.issues.push(issue);
        this.emit('issue-found', { category: issue.category, title: issue.title });
      }

      // Network errors
      for (const error of page.networkErrors) {
        const issue = await evidenceCollector.createIssue({
          category: 'network-error',
          title: `Network error: ${error.method} ${error.url.slice(0, 40)}`,
          description: `Network request failed with ${error.status || 'error'}`,
          pageUrl: page.url,
          networkSnippet: `${error.method} ${error.url} - ${error.status || error.errorText}`,
          severity: error.status && error.status >= 500 ? 'high' : 'medium',
        });
        this.issues.push(issue);
        this.emit('issue-found', { category: issue.category, title: issue.title });
      }
    }
  }

  /**
   * Run accessibility checks
   */
  private async checkAccessibility(
    pages: PageInfo[],
    evidenceCollector: EvidenceCollector
  ): Promise<void> {
    this.emit('a11y-check', {});

    const a11yChecker = new A11yChecker({
      context: this.context!,
      config: this.config,
      evidenceCollector,
      onIssue: (issue) => {
        this.issues.push(issue);
        this.emit('issue-found', { category: issue.category, title: issue.title });
      },
    });

    for (const page of pages) {
      await a11yChecker.checkPage(page.url);
    }
  }

  /**
   * Generate the final report
   */
  private async generateReport(crawlResult: CrawlResult): Promise<Report> {
    const endTime = new Date();
    const durationMs = endTime.getTime() - this.startTime!.getTime();

    // Calculate summary
    const summary = this.calculateSummary(crawlResult, durationMs);

    // Generate AI summary if available
    let aiSummary;
    if (this.config.openaiApiKey) {
      const summarizer = new AISummarizer(this.config.openaiApiKey);
      try {
        aiSummary = await summarizer.summarize(this.issues, summary);
      } catch {
        // AI summarization is optional
      }
    }

    const meta: ReportMeta = {
      title: this.config.reportTitle,
      version: '0.1.0',
      generatedAt: endTime,
      config: this.config,
    };

    return {
      meta,
      crawl: crawlResult,
      issues: this.issues,
      summary,
      aiSummary,
    };
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(crawlResult: CrawlResult, durationMs: number): ReportSummary {
    const issuesByCategory: Record<IssueCategory, number> = {
      'form-validation': 0,
      'form-required': 0,
      'form-invalid-input': 0,
      'broken-link': 0,
      'console-error': 0,
      'network-error': 0,
      'a11y-missing-label': 0,
      'a11y-missing-name': 0,
      'a11y-focus-trap': 0,
      other: 0,
    };

    const issuesBySeverity: Record<IssueSeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    for (const issue of this.issues) {
      issuesByCategory[issue.category]++;
      issuesBySeverity[issue.severity]++;
    }

    // Sort issues by severity for top issues
    const sortedIssues = [...this.issues].sort((a, b) => {
      const severityOrder: Record<IssueSeverity, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
        info: 4,
      };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    const formsDiscovered = crawlResult.pages.reduce((sum, page) => sum + page.forms.length, 0);
    const linksFound = crawlResult.pages.reduce((sum, page) => sum + page.links.length, 0);
    const brokenLinksFound = this.issues.filter((i) => i.category === 'broken-link').length;

    return {
      totalPagesVisited: crawlResult.totalPagesVisited,
      maxPagesReached: crawlResult.maxPagesReached,
      formsDiscovered,
      formsTested: formsDiscovered, // All discovered forms are tested
      linksChecked: linksFound,
      brokenLinksFound,
      issuesByCategory,
      issuesBySeverity,
      totalIssues: this.issues.length,
      topIssues: sortedIssues.slice(0, 10),
      durationMs,
    };
  }

  /**
   * Write all report files
   */
  private async writeReports(report: Report): Promise<void> {
    const jsonWriter = new JsonReportWriter();
    const htmlWriter = new HtmlReportWriter();
    const mdWriter = new MarkdownReportWriter();

    await Promise.all([
      jsonWriter.write(report, join(this.config.outputDir, 'report.json')),
      htmlWriter.write(report, join(this.config.outputDir, 'report.html')),
      mdWriter.write(report, join(this.config.outputDir, 'bugs.md')),
    ]);
  }

  /**
   * Clean up resources
   */
  private async cleanup(): Promise<void> {
    if (this.context) {
      await this.context.close().catch(() => {});
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
    }
  }
}
