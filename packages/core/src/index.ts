/**
 * Web Autopilot Core
 * Main exports for the web-autopilot core library
 *
 * Includes specialized modules for testing Copilot-style LLM chat applications.
 */

// Main orchestrator
export { WebAutopilot } from './autopilot.js';

// Types
export * from './types.js';

// Utilities
export * from './utils/index.js';

// Sub-modules (for advanced usage)
export { Crawler } from './crawler/index.js';
export { FormDetector, FormTester } from './forms/index.js';
export { LinkChecker } from './links/index.js';
export { A11yChecker } from './a11y/index.js';
export { EvidenceCollector } from './evidence/index.js';
export { JsonReportWriter, MarkdownReportWriter, HtmlReportWriter } from './reports/index.js';
export { AISummarizer } from './ai/index.js';

// ============================================================================
// LLM CHAT APPLICATION TESTING (Copilot-style apps)
// ============================================================================

// Chaos/Monkey exploration
export { ChaosRunner } from './llm/chaos-runner.js';
export type { ChaosConfig, ChaosAction, ChaosResult } from './llm/chaos-runner.js';

// Streaming response validation
export { StreamingValidator } from './llm/streaming-validator.js';
export type { StreamingConfig, StreamingMetrics } from './llm/streaming-validator.js';

// Chat UX flow testing
export { ChatFlowChecker } from './llm/chat-flow-checker.js';
export type { ChatFlowConfig, ChatFlowResult } from './llm/chat-flow-checker.js';

// Prompt corpus testing
export { PromptCorpusTester } from './llm/prompt-corpus.js';
export type { PromptCorpusConfig, PromptTestCase, PromptTestResult } from './llm/prompt-corpus.js';

// ============================================================================
// RESPONSE VALIDATORS
// ============================================================================

export { JsonValidator } from './validators/json-validator.js';
export { MarkdownValidator } from './validators/markdown-validator.js';
export { CodeBlockValidator } from './validators/code-block-validator.js';
export { ConsoleErrorValidator } from './validators/console-error-validator.js';
export type { ValidationResult, ValidatorConfig } from './validators/types.js';

// ============================================================================
// RELIABILITY TESTING
// ============================================================================

// Network condition injection
export { NetworkInjector, PRESET_CONDITIONS } from './reliability/network-injector.js';
export type { NetworkCondition, NetworkInjectorConfig } from './reliability/network-injector.js';

// Performance metrics (TTFT, memory, scroll)
export { PerformanceMetrics } from './reliability/performance-metrics.js';
export type { PerformanceConfig, MetricsReport, TTFTMetrics } from './reliability/performance-metrics.js';
