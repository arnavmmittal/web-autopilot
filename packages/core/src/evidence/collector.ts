/**
 * Evidence collector - screenshots, traces, and issue creation
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

import type { Page } from 'playwright';

import type { Issue, IssueCategory, IssueSeverity, Evidence } from '../types.js';
import { generateIssueId } from '../utils/id.js';
import { getDefaultSeverity } from '../utils/severity.js';

interface EvidenceCollectorOptions {
  outputDir: string;
  runId: string;
}

interface CreateIssueOptions {
  category: IssueCategory;
  title: string;
  description: string;
  pageUrl: string;
  selectors?: string[];
  reproSteps?: string[];
  screenshotPath?: string;
  tracePath?: string;
  consoleSnippet?: string;
  networkSnippet?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  suggestedFix?: string;
  severity?: IssueSeverity;
}

export class EvidenceCollector {
  private outputDir: string;
  private runId: string;
  private screenshotDir: string;
  private traceDir: string;

  constructor(options: EvidenceCollectorOptions) {
    this.outputDir = options.outputDir;
    this.runId = options.runId;
    this.screenshotDir = join(options.outputDir, 'artifacts', 'screenshots');
    this.traceDir = join(options.outputDir, 'artifacts', 'traces');
  }

  /**
   * Take a screenshot of the current page state
   */
  async takeScreenshot(page: Page, name: string): Promise<string> {
    const filename = `${name}.png`;
    const filepath = join(this.screenshotDir, filename);

    try {
      await page.screenshot({
        path: filepath,
        fullPage: false,
        type: 'png',
      });
      return filepath;
    } catch {
      return '';
    }
  }

  /**
   * Take a full-page screenshot
   */
  async takeFullPageScreenshot(page: Page, name: string): Promise<string> {
    const filename = `${name}-full.png`;
    const filepath = join(this.screenshotDir, filename);

    try {
      await page.screenshot({
        path: filepath,
        fullPage: true,
        type: 'png',
      });
      return filepath;
    } catch {
      return '';
    }
  }

  /**
   * Save a trace file
   */
  async saveTrace(page: Page): Promise<string> {
    const filename = `trace-${Date.now()}.zip`;
    const filepath = join(this.traceDir, filename);

    try {
      await page.context().tracing.stop({ path: filepath });
      return filepath;
    } catch {
      return '';
    }
  }

  /**
   * Create an issue with evidence
   */
  async createIssue(options: CreateIssueOptions): Promise<Issue> {
    const id = generateIssueId();
    const severity = options.severity || getDefaultSeverity(options.category);

    const evidence: Evidence = {};

    if (options.screenshotPath) {
      evidence.screenshot = options.screenshotPath;
    }
    if (options.tracePath) {
      evidence.trace = options.tracePath;
    }
    if (options.consoleSnippet) {
      evidence.consoleLog = [options.consoleSnippet];
    }
    if (options.networkSnippet) {
      evidence.networkLog = [
        {
          url: options.pageUrl,
          method: 'GET',
          error: options.networkSnippet,
        },
      ];
    }

    const issue: Issue = {
      id,
      severity,
      category: options.category,
      title: options.title,
      description: options.description,
      pageUrl: options.pageUrl,
      selectors: options.selectors || [],
      reproSteps: options.reproSteps || [],
      screenshotPath: options.screenshotPath,
      tracePath: options.tracePath,
      consoleSnippet: options.consoleSnippet,
      networkSnippet: options.networkSnippet,
      expectedBehavior: options.expectedBehavior,
      actualBehavior: options.actualBehavior,
      suggestedFix: options.suggestedFix,
      foundAt: new Date(),
      evidence,
    };

    return issue;
  }

  /**
   * Save raw evidence data to a file
   */
  async saveEvidenceFile(name: string, data: string | Buffer): Promise<string> {
    const filepath = join(this.outputDir, 'artifacts', name);

    await mkdir(join(this.outputDir, 'artifacts'), { recursive: true });
    await writeFile(filepath, data);

    return filepath;
  }

  /**
   * Capture an element screenshot
   */
  async captureElementScreenshot(
    page: Page,
    selector: string,
    name: string
  ): Promise<string> {
    const filename = `${name}-element.png`;
    const filepath = join(this.screenshotDir, filename);

    try {
      const element = await page.locator(selector).first();
      await element.screenshot({ path: filepath });
      return filepath;
    } catch {
      // Element not found or not visible, take page screenshot instead
      return this.takeScreenshot(page, name);
    }
  }
}
