/**
 * Core types for web-autopilot
 */

// ============================================================================
// Configuration Types
// ============================================================================

export type GoalPreset = 'forms' | 'links' | 'console' | 'a11y-lite' | 'full';

export interface RunConfig {
  url: string;
  maxPages: number;
  timeoutMs: number;
  headed: boolean;
  outputDir: string;
  allowExternal: boolean;
  allowDestructive: boolean;
  goals: Goal[];
  reportTitle: string;
  demo: boolean;
  openaiApiKey?: string;
}

export interface Goal {
  type: 'preset' | 'custom';
  value: GoalPreset | string;
}

export const DEFAULT_CONFIG: Partial<RunConfig> = {
  maxPages: 50,
  timeoutMs: 30000,
  headed: false,
  outputDir: './output',
  allowExternal: false,
  allowDestructive: false,
  goals: [{ type: 'preset', value: 'full' }],
  reportTitle: 'Web Autopilot Report',
  demo: false,
};

export const DEMO_CONFIG: Partial<RunConfig> = {
  url: 'https://the-internet.herokuapp.com',
  maxPages: 10,
  timeoutMs: 15000,
  headed: false,
  outputDir: './examples/demo-output',
  allowExternal: false,
  allowDestructive: false,
  goals: [{ type: 'preset', value: 'full' }],
  reportTitle: 'Web Autopilot Demo Report',
  demo: true,
};

// ============================================================================
// Page & Crawling Types
// ============================================================================

export interface PageInfo {
  url: string;
  normalizedUrl: string;
  title: string;
  statusCode: number;
  loadTimeMs: number;
  visitedAt: Date;
  links: string[];
  forms: FormInfo[];
  consoleErrors: ConsoleError[];
  networkErrors: NetworkError[];
}

export interface CrawlResult {
  pages: PageInfo[];
  startUrl: string;
  startedAt: Date;
  completedAt: Date;
  totalPagesVisited: number;
  maxPagesReached: boolean;
}

// ============================================================================
// Form Types
// ============================================================================

export interface FormInfo {
  selector: string;
  id?: string;
  name?: string;
  action?: string;
  method: string;
  fields: FormField[];
  submitButton?: SubmitButtonInfo;
  isFormLike: boolean; // true if detected as form-like group, not actual <form>
}

export interface FormField {
  selector: string;
  tagName: string;
  type: string;
  name?: string;
  id?: string;
  placeholder?: string;
  label?: string;
  ariaLabel?: string;
  inferredType: InferredFieldType;
  isRequired: boolean;
  requiredReason?: RequiredReason;
}

export type InferredFieldType =
  | 'email'
  | 'phone'
  | 'password'
  | 'postal'
  | 'text'
  | 'number'
  | 'date'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'file'
  | 'unknown';

export type RequiredReason =
  | 'required-attribute'
  | 'aria-required'
  | 'label-asterisk'
  | 'label-text'
  | 'none';

export interface SubmitButtonInfo {
  selector: string;
  text: string;
  type: string;
  isDestructive: boolean;
}

// ============================================================================
// Issue Types
// ============================================================================

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type IssueCategory =
  | 'form-validation'
  | 'form-required'
  | 'form-invalid-input'
  | 'broken-link'
  | 'console-error'
  | 'network-error'
  | 'a11y-missing-label'
  | 'a11y-missing-name'
  | 'a11y-focus-trap'
  // LLM Chat Testing Categories
  | 'llm-streaming'
  | 'llm-chat-flow'
  | 'llm-prompt-corpus'
  | 'llm-chaos'
  | 'llm-reliability'
  | 'llm-performance'
  | 'other';

export interface Issue {
  id: string;
  severity: IssueSeverity;
  category: IssueCategory;
  title: string;
  description: string;
  pageUrl: string;
  selectors: string[];
  reproSteps: string[];
  screenshotPath?: string;
  tracePath?: string;
  consoleSnippet?: string;
  networkSnippet?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  suggestedFix?: string;
  aiSuggestedFix?: string;
  foundAt: Date;
  evidence: Evidence;
}

export interface Evidence {
  screenshot?: string;
  trace?: string;
  consoleLog?: string[];
  networkLog?: NetworkLogEntry[];
  htmlSnippet?: string;
}

// ============================================================================
// Error Capture Types
// ============================================================================

export interface ConsoleError {
  type: 'error' | 'warning' | 'pageerror';
  message: string;
  url?: string;
  lineNumber?: number;
  timestamp: Date;
}

export interface NetworkError {
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  errorText?: string;
  resourceType: string;
  timestamp: Date;
}

export interface NetworkLogEntry {
  url: string;
  method: string;
  status?: number;
  timing?: number;
  error?: string;
}

// ============================================================================
// Link Check Types
// ============================================================================

export interface LinkCheckResult {
  url: string;
  foundOnPage: string;
  status: number | null;
  error?: string;
  isValid: boolean;
}

// ============================================================================
// Accessibility Types
// ============================================================================

export interface A11yIssue {
  type: 'missing-label' | 'missing-name' | 'focus-trap';
  element: string;
  selector: string;
  description: string;
  wcagCriteria?: string;
}

// ============================================================================
// Report Types
// ============================================================================

export interface Report {
  meta: ReportMeta;
  crawl: CrawlResult;
  issues: Issue[];
  summary: ReportSummary;
  aiSummary?: AISummary;
}

export interface ReportMeta {
  title: string;
  version: string;
  generatedAt: Date;
  config: RunConfig;
}

export interface ReportSummary {
  totalPagesVisited: number;
  maxPagesReached: boolean;
  formsDiscovered: number;
  formsTested: number;
  linksChecked: number;
  brokenLinksFound: number;
  issuesByCategory: Record<IssueCategory, number>;
  issuesBySeverity: Record<IssueSeverity, number>;
  totalIssues: number;
  topIssues: Issue[];
  durationMs: number;
}

export interface AISummary {
  executiveSummary: string;
  topRisks: string[];
  suggestedFixes: Array<{
    issueId: string;
    suggestion: string;
  }>;
  overallHealthScore: number; // 0-100
}

// ============================================================================
// Scorecard Types (Terminal Output)
// ============================================================================

export interface Scorecard {
  pagesVisited: number;
  maxPages: number;
  formsDiscovered: number;
  formsTested: number;
  issuesTotal: number;
  issuesByCategory: Record<string, number>;
  topIssues: Array<{
    title: string;
    severity: IssueSeverity;
    url: string;
  }>;
  outputPaths: {
    reportHtml: string;
    reportJson: string;
    bugsMd: string;
    artifacts: string;
  };
  durationMs: number;
}

// ============================================================================
// Event Types for Progress Reporting
// ============================================================================

export type AutopilotEventType =
  | 'start'
  | 'page-visit'
  | 'form-found'
  | 'form-test-start'
  | 'form-test-complete'
  | 'issue-found'
  | 'link-check'
  | 'a11y-check'
  | 'complete'
  | 'error';

export interface AutopilotEvent {
  type: AutopilotEventType;
  timestamp: Date;
  data: unknown;
}

export type EventCallback = (event: AutopilotEvent) => void;
