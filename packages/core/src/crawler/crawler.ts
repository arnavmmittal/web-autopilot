/**
 * BFS Web Crawler with event capture
 */

import type { BrowserContext, Page, Response } from 'playwright';

import type {
  RunConfig,
  CrawlResult,
  PageInfo,
  FormInfo,
  ConsoleError,
  NetworkError,
} from '../types.js';
import { normalizeUrl, isInternalUrl, isNavigableUrl, toAbsoluteUrl } from '../utils/url.js';
import { FormDetector } from '../forms/detector.js';

interface CrawlerOptions {
  context: BrowserContext;
  config: RunConfig;
  onPageVisit?: (url: string, current: number, total: number) => void;
  onFormFound?: (count: number) => void;
  onConsoleError?: (error: ConsoleError) => void;
  onNetworkError?: (error: NetworkError) => void;
}

export class Crawler {
  private context: BrowserContext;
  private config: RunConfig;
  private options: CrawlerOptions;
  private visited: Set<string> = new Set();
  private queue: string[] = [];
  private pages: PageInfo[] = [];
  private formDetector: FormDetector;

  constructor(options: CrawlerOptions) {
    this.context = options.context;
    this.config = options.config;
    this.options = options;
    this.formDetector = new FormDetector();
  }

  /**
   * Start crawling from the given URL
   */
  async crawl(startUrl: string): Promise<CrawlResult> {
    const startedAt = new Date();
    const normalizedStart = normalizeUrl(startUrl);

    this.queue.push(normalizedStart);
    this.visited.add(normalizedStart);

    while (this.queue.length > 0 && this.pages.length < this.config.maxPages) {
      const url = this.queue.shift()!;
      const pageInfo = await this.visitPage(url);

      if (pageInfo) {
        this.pages.push(pageInfo);
        this.options.onPageVisit?.(url, this.pages.length, this.config.maxPages);

        // Add new links to queue
        for (const link of pageInfo.links) {
          const normalizedLink = normalizeUrl(link, url);

          if (this.shouldVisit(normalizedLink, startUrl)) {
            this.visited.add(normalizedLink);
            this.queue.push(normalizedLink);
          }
        }
      }
    }

    return {
      pages: this.pages,
      startUrl,
      startedAt,
      completedAt: new Date(),
      totalPagesVisited: this.pages.length,
      maxPagesReached: this.pages.length >= this.config.maxPages,
    };
  }

  /**
   * Check if a URL should be visited
   */
  private shouldVisit(url: string, baseUrl: string): boolean {
    // Already visited
    if (this.visited.has(url)) {
      return false;
    }

    // Not navigable (PDF, image, etc.)
    if (!isNavigableUrl(url)) {
      return false;
    }

    // External URL handling
    if (!isInternalUrl(url, baseUrl)) {
      return this.config.allowExternal;
    }

    return true;
  }

  /**
   * Visit a single page and collect information
   */
  private async visitPage(url: string): Promise<PageInfo | null> {
    const page = await this.context.newPage();
    const consoleErrors: ConsoleError[] = [];
    const networkErrors: NetworkError[] = [];
    const startTime = Date.now();

    try {
      // Set up console listener
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const error: ConsoleError = {
            type: 'error',
            message: msg.text(),
            url: msg.location().url,
            lineNumber: msg.location().lineNumber,
            timestamp: new Date(),
          };
          consoleErrors.push(error);
          this.options.onConsoleError?.(error);
        }
      });

      // Set up page error listener
      page.on('pageerror', (error) => {
        const consoleError: ConsoleError = {
          type: 'pageerror',
          message: error.message,
          timestamp: new Date(),
        };
        consoleErrors.push(consoleError);
        this.options.onConsoleError?.(consoleError);
      });

      // Set up request failed listener
      page.on('requestfailed', (request) => {
        const failure = request.failure();
        const error: NetworkError = {
          url: request.url(),
          method: request.method(),
          errorText: failure?.errorText,
          resourceType: request.resourceType(),
          timestamp: new Date(),
        };
        networkErrors.push(error);
        this.options.onNetworkError?.(error);
      });

      // Set up response listener for 4xx/5xx
      page.on('response', (response: Response) => {
        const status = response.status();
        if (status >= 400) {
          const error: NetworkError = {
            url: response.url(),
            method: response.request().method(),
            status,
            statusText: response.statusText(),
            resourceType: response.request().resourceType(),
            timestamp: new Date(),
          };
          networkErrors.push(error);
          this.options.onNetworkError?.(error);
        }
      });

      // Navigate to page
      const response = await page.goto(url, {
        timeout: this.config.timeoutMs,
        waitUntil: 'domcontentloaded',
      });

      const loadTimeMs = Date.now() - startTime;
      const statusCode = response?.status() ?? 0;

      // Get page title
      const title = await page.title();

      // Extract links
      const links = await this.extractLinks(page, url);

      // Detect forms
      const forms = await this.formDetector.detectForms(page);
      if (forms.length > 0) {
        this.options.onFormFound?.(forms.length);
      }

      return {
        url,
        normalizedUrl: normalizeUrl(url),
        title,
        statusCode,
        loadTimeMs,
        visitedAt: new Date(),
        links,
        forms,
        consoleErrors,
        networkErrors,
      };
    } catch (error) {
      // Page failed to load completely
      const loadTimeMs = Date.now() - startTime;

      return {
        url,
        normalizedUrl: normalizeUrl(url),
        title: 'Error loading page',
        statusCode: 0,
        loadTimeMs,
        visitedAt: new Date(),
        links: [],
        forms: [],
        consoleErrors,
        networkErrors: [
          ...networkErrors,
          {
            url,
            method: 'GET',
            errorText: error instanceof Error ? error.message : 'Unknown error',
            resourceType: 'document',
            timestamp: new Date(),
          },
        ],
      };
    } finally {
      await page.close();
    }
  }

  /**
   * Extract all links from a page
   */
  private async extractLinks(page: Page, baseUrl: string): Promise<string[]> {
    const hrefs = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a[href]');
      return Array.from(anchors)
        .map((a) => a.getAttribute('href'))
        .filter((href): href is string => href !== null && href.length > 0);
    });

    // Convert to absolute URLs and dedupe
    const links = new Set<string>();
    for (const href of hrefs) {
      const absolute = toAbsoluteUrl(href, baseUrl);
      if (absolute && isNavigableUrl(absolute)) {
        links.add(normalizeUrl(absolute));
      }
    }

    return Array.from(links);
  }
}
