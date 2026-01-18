/**
 * Web Autopilot Core
 * Main exports for the web-autopilot core library
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
