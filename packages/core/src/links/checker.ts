/**
 * Link validation - checks for broken links (4xx/5xx responses)
 */

import type { BrowserContext } from 'playwright';

import { EvidenceCollector } from '../evidence/collector.js';
import type { RunConfig, PageInfo, Issue, LinkCheckResult } from '../types.js';
import { normalizeUrl, isInternalUrl } from '../utils/url.js';

interface LinkCheckerOptions {
  context: BrowserContext;
  config: RunConfig;
  evidenceCollector: EvidenceCollector;
  onProgress: (checked: number, total: number) => void;
  onIssue: (issue: Issue) => void;
}

export class LinkChecker {
  private context: BrowserContext;
  private config: RunConfig;
  private evidenceCollector: EvidenceCollector;
  private onProgress: (checked: number, total: number) => void;
  private onIssue: (issue: Issue) => void;
  private checkedLinks: Map<string, LinkCheckResult> = new Map();

  constructor(options: LinkCheckerOptions) {
    this.context = options.context;
    this.config = options.config;
    this.evidenceCollector = options.evidenceCollector;
    this.onProgress = options.onProgress;
    this.onIssue = options.onIssue;
  }

  /**
   * Check all links from the crawled pages
   */
  async checkPages(pages: PageInfo[]): Promise<void> {
    // Collect all unique links with their source pages
    const linksToCheck = new Map<string, string[]>();

    for (const page of pages) {
      for (const link of page.links) {
        const normalized = normalizeUrl(link, page.url);

        // Only check internal links unless external is allowed
        if (!this.config.allowExternal && !isInternalUrl(normalized, this.config.url)) {
          continue;
        }

        const sources = linksToCheck.get(normalized) || [];
        sources.push(page.url);
        linksToCheck.set(normalized, sources);
      }
    }

    const totalLinks = linksToCheck.size;
    let checkedCount = 0;

    // Check links in batches for efficiency
    const batchSize = 5;
    const entries = Array.from(linksToCheck.entries());

    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async ([url, sourcePages]) => {
          const result = await this.checkLink(url, sourcePages[0]);

          if (!result.isValid) {
            await this.reportBrokenLink(result, sourcePages);
          }

          checkedCount++;
          this.onProgress(checkedCount, totalLinks);
        })
      );
    }
  }

  /**
   * Check a single link
   */
  private async checkLink(url: string, sourceUrl: string): Promise<LinkCheckResult> {
    // Check cache first
    const cached = this.checkedLinks.get(url);
    if (cached) {
      return cached;
    }

    let result: LinkCheckResult;

    try {
      // Use fetch API via Playwright page for consistent behavior
      const page = await this.context.newPage();

      try {
        const response = await page.goto(url, {
          timeout: 10000,
          waitUntil: 'commit', // Only wait for response headers
        });

        const status = response?.status() ?? 0;

        result = {
          url,
          foundOnPage: sourceUrl,
          status,
          isValid: status > 0 && status < 400,
        };
      } finally {
        await page.close();
      }
    } catch (error) {
      result = {
        url,
        foundOnPage: sourceUrl,
        status: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        isValid: false,
      };
    }

    // Cache result
    this.checkedLinks.set(url, result);

    return result;
  }

  /**
   * Report a broken link as an issue
   */
  private async reportBrokenLink(result: LinkCheckResult, sourcePages: string[]): Promise<void> {
    const statusText = result.status
      ? `HTTP ${result.status}`
      : result.error || 'Connection failed';

    const issue = await this.evidenceCollector.createIssue({
      category: 'broken-link',
      title: `Broken link: ${statusText}`,
      description: `Link to "${result.url}" returns ${statusText}. Found on ${sourcePages.length} page(s).`,
      pageUrl: sourcePages[0],
      selectors: [], // Links don't have consistent selectors
      reproSteps: [
        `Navigate to ${sourcePages[0]}`,
        `Find link to: ${result.url}`,
        `Click the link or check its status`,
        `Observe: Link returns ${statusText}`,
      ],
      expectedBehavior: 'Link should return a successful response (2xx)',
      actualBehavior: `Link returns ${statusText}`,
      severity: result.status && result.status >= 500 ? 'high' : 'medium',
      networkSnippet: JSON.stringify(
        {
          url: result.url,
          status: result.status,
          error: result.error,
          foundOn: sourcePages.slice(0, 3),
        },
        null,
        2
      ),
    });

    this.onIssue(issue);
  }
}
