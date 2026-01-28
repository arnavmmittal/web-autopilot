/**
 * Performance Metrics - Measure and track LLM app performance
 *
 * Key metrics for Copilot-style apps:
 * - Time to First Token (TTFT)
 * - Total response time
 * - UI responsiveness during streaming
 * - Memory usage trends
 * - Scroll performance in long conversations
 */

import type { Page } from 'playwright';
import type { Issue } from '../types.js';

export interface PerformanceConfig {
  /** TTFT threshold in milliseconds */
  ttftThresholdMs: number;
  /** Total response time threshold */
  responseThresholdMs: number;
  /** Memory increase threshold (MB) */
  memoryThresholdMb: number;
  /** Frame rate threshold for smooth scrolling */
  minFrameRate: number;
  /** Number of messages for memory leak test */
  memoryTestMessageCount: number;
}

export interface TTFTMetrics {
  /** Time from action to first visible token */
  ttftMs: number;
  /** Time from action to response complete */
  totalMs: number;
  /** Whether TTFT was within threshold */
  withinThreshold: boolean;
  /** Timestamp */
  timestamp: number;
}

export interface MemoryMetrics {
  /** Initial heap size in MB */
  initialHeapMb: number;
  /** Final heap size in MB */
  finalHeapMb: number;
  /** Heap increase in MB */
  heapIncreaseMb: number;
  /** Whether within threshold */
  withinThreshold: boolean;
  /** Number of messages sent */
  messageCount: number;
}

export interface ScrollMetrics {
  /** Average frame rate during scroll */
  avgFrameRate: number;
  /** Minimum frame rate observed */
  minFrameRate: number;
  /** Whether scroll was smooth */
  smooth: boolean;
}

export interface MetricsReport {
  ttft: TTFTMetrics[];
  memory: MemoryMetrics | null;
  scroll: ScrollMetrics | null;
  issues: Issue[];
  summary: {
    avgTtftMs: number;
    maxTtftMs: number;
    memoryLeakDetected: boolean;
    scrollJankDetected: boolean;
  };
}

const DEFAULT_CONFIG: PerformanceConfig = {
  ttftThresholdMs: 3000,
  responseThresholdMs: 30000,
  memoryThresholdMb: 100,
  minFrameRate: 30,
  memoryTestMessageCount: 20,
};

export class PerformanceMetrics {
  private page: Page;
  private config: PerformanceConfig;
  private ttftMeasurements: TTFTMetrics[] = [];

  constructor(page: Page, config: Partial<PerformanceConfig> = {}) {
    this.page = page;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Measure TTFT for a single prompt
   */
  async measureTTFT(
    sendPrompt: () => Promise<void>,
    responseSelector: string = '[data-testid*="message"], [class*="message"]'
  ): Promise<TTFTMetrics> {
    // Get initial state
    const initialResponses = await this.page.$$(responseSelector);
    const initialCount = initialResponses.length;

    // Record start time
    const startTime = Date.now();

    // Send prompt
    await sendPrompt();

    // Wait for first token (new element or content change)
    let firstTokenTime = 0;
    let totalTime = 0;
    const maxWait = this.config.responseThresholdMs;

    while (Date.now() - startTime < maxWait) {
      const responses = await this.page.$$(responseSelector);

      if (responses.length > initialCount) {
        // New response appeared
        if (firstTokenTime === 0) {
          // Check if it has content
          const latest = responses[responses.length - 1];
          const content = await latest.textContent();
          if (content && content.trim().length > 0) {
            firstTokenTime = Date.now() - startTime;
          }
        }

        // Check if streaming is complete (no streaming indicators)
        const isStreaming = await this.page.$('[data-streaming="true"], [class*="streaming"]');
        if (!isStreaming && firstTokenTime > 0) {
          totalTime = Date.now() - startTime;
          break;
        }
      }

      await this.page.waitForTimeout(50);
    }

    if (firstTokenTime === 0) {
      firstTokenTime = Date.now() - startTime;
    }
    if (totalTime === 0) {
      totalTime = Date.now() - startTime;
    }

    const metrics: TTFTMetrics = {
      ttftMs: firstTokenTime,
      totalMs: totalTime,
      withinThreshold: firstTokenTime <= this.config.ttftThresholdMs,
      timestamp: Date.now(),
    };

    this.ttftMeasurements.push(metrics);
    return metrics;
  }

  /**
   * Run memory leak smoke test
   */
  async testMemoryLeak(
    sendPrompt: () => Promise<void>,
    clearChat?: () => Promise<void>
  ): Promise<MemoryMetrics> {
    // Get initial memory
    const initialMetrics = await this.page.evaluate(() => {
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize / 1024 / 1024;
      }
      return 0;
    });

    // Send many messages
    for (let i = 0; i < this.config.memoryTestMessageCount; i++) {
      await sendPrompt();
      await this.page.waitForTimeout(500); // Wait for response
    }

    // Force garbage collection if possible
    await this.page.evaluate(() => {
      if ('gc' in window) {
        (window as any).gc();
      }
    });

    await this.page.waitForTimeout(1000);

    // Get final memory
    const finalMetrics = await this.page.evaluate(() => {
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize / 1024 / 1024;
      }
      return 0;
    });

    const heapIncrease = finalMetrics - initialMetrics;

    return {
      initialHeapMb: initialMetrics,
      finalHeapMb: finalMetrics,
      heapIncreaseMb: heapIncrease,
      withinThreshold: heapIncrease <= this.config.memoryThresholdMb,
      messageCount: this.config.memoryTestMessageCount,
    };
  }

  /**
   * Test scroll performance in a long conversation
   */
  async testScrollPerformance(): Promise<ScrollMetrics> {
    const frameRates: number[] = [];

    // Set up frame rate monitoring
    await this.page.evaluate(() => {
      (window as any).__frameRates = [];
      let lastTime = performance.now();
      let frameCount = 0;

      const measureFrame = () => {
        frameCount++;
        const now = performance.now();
        if (now - lastTime >= 1000) {
          (window as any).__frameRates.push(frameCount);
          frameCount = 0;
          lastTime = now;
        }
        requestAnimationFrame(measureFrame);
      };
      requestAnimationFrame(measureFrame);
    });

    // Perform scroll operations
    for (let i = 0; i < 5; i++) {
      await this.page.mouse.wheel(0, 500);
      await this.page.waitForTimeout(200);
    }

    // Scroll back up
    for (let i = 0; i < 5; i++) {
      await this.page.mouse.wheel(0, -500);
      await this.page.waitForTimeout(200);
    }

    // Get frame rates
    const rates = await this.page.evaluate(() => {
      return (window as any).__frameRates || [];
    }) as number[];

    const avgRate = rates.length > 0
      ? rates.reduce((a, b) => a + b, 0) / rates.length
      : 60;
    const minRate = rates.length > 0 ? Math.min(...rates) : 60;

    return {
      avgFrameRate: avgRate,
      minFrameRate: minRate,
      smooth: minRate >= this.config.minFrameRate,
    };
  }

  /**
   * Generate comprehensive metrics report
   */
  async generateReport(
    sendPrompt: () => Promise<void>,
    options: {
      measureTTFT?: boolean;
      measureMemory?: boolean;
      measureScroll?: boolean;
      ttftSamples?: number;
    } = {}
  ): Promise<MetricsReport> {
    const issues: Issue[] = [];
    let memory: MemoryMetrics | null = null;
    let scroll: ScrollMetrics | null = null;

    // Measure TTFT
    if (options.measureTTFT !== false) {
      const samples = options.ttftSamples ?? 3;
      for (let i = 0; i < samples; i++) {
        const ttft = await this.measureTTFT(sendPrompt);
        if (!ttft.withinThreshold) {
          issues.push({
            id: `perf-ttft-${Date.now()}`,
            severity: 'medium',
            category: 'llm-performance',
            title: `Slow TTFT: ${ttft.ttftMs}ms`,
            description: `Time to first token (${ttft.ttftMs}ms) exceeded threshold (${this.config.ttftThresholdMs}ms)`,
            pageUrl: this.page.url(),
            reproSteps: ['Send a prompt', 'Measure time to first visible token'],
            selectors: [],
            foundAt: new Date(),
            evidence: {},
          });
        }
        await this.page.waitForTimeout(1000);
      }
    }

    // Measure memory
    if (options.measureMemory) {
      memory = await this.testMemoryLeak(sendPrompt);
      if (!memory.withinThreshold) {
        issues.push({
          id: `perf-memory-${Date.now()}`,
          severity: 'high',
          category: 'llm-performance',
          title: `Potential memory leak: +${memory.heapIncreaseMb.toFixed(1)}MB`,
          description: `Heap increased by ${memory.heapIncreaseMb.toFixed(1)}MB after ${memory.messageCount} messages (threshold: ${this.config.memoryThresholdMb}MB)`,
          pageUrl: this.page.url(),
          reproSteps: [`Send ${memory.messageCount} messages`, 'Observe memory growth'],
          selectors: [],
          foundAt: new Date(),
          evidence: {},
        });
      }
    }

    // Measure scroll
    if (options.measureScroll) {
      scroll = await this.testScrollPerformance();
      if (!scroll.smooth) {
        issues.push({
          id: `perf-scroll-${Date.now()}`,
          severity: 'medium',
          category: 'llm-performance',
          title: `Scroll jank detected: ${scroll.minFrameRate.toFixed(0)} FPS`,
          description: `Minimum frame rate (${scroll.minFrameRate.toFixed(0)} FPS) below threshold (${this.config.minFrameRate} FPS)`,
          pageUrl: this.page.url(),
          reproSteps: ['Scroll through conversation', 'Observe frame rate'],
          selectors: [],
          foundAt: new Date(),
          evidence: {},
        });
      }
    }

    // Calculate summary
    const ttftValues = this.ttftMeasurements.map(m => m.ttftMs);
    const avgTtft = ttftValues.length > 0
      ? ttftValues.reduce((a, b) => a + b, 0) / ttftValues.length
      : 0;
    const maxTtft = ttftValues.length > 0 ? Math.max(...ttftValues) : 0;

    return {
      ttft: this.ttftMeasurements,
      memory,
      scroll,
      issues,
      summary: {
        avgTtftMs: avgTtft,
        maxTtftMs: maxTtft,
        memoryLeakDetected: memory ? !memory.withinThreshold : false,
        scrollJankDetected: scroll ? !scroll.smooth : false,
      },
    };
  }

  /**
   * Clear all measurements
   */
  clear(): void {
    this.ttftMeasurements = [];
  }
}
