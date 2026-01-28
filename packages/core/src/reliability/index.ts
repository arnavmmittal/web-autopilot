/**
 * Reliability Testing Module
 *
 * Tests application resilience under adverse conditions:
 * - Network failures and latency
 * - Error response handling (429, 5xx)
 * - WebSocket/SSE disruptions
 * - Resource constraints
 */

export { NetworkInjector } from './network-injector.js';
export type { NetworkCondition, NetworkInjectorConfig } from './network-injector.js';

export { PerformanceMetrics } from './performance-metrics.js';
export type { PerformanceConfig, MetricsReport, TTFTMetrics } from './performance-metrics.js';
