# Web Autopilot Architecture

This document provides a detailed overview of the Web Autopilot architecture, including module responsibilities, data flow, and design decisions.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                              CLI Layer                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │   Commander  │  │   Progress   │  │   Scorecard  │               │
│  │   Parsing    │  │   Display    │  │   Output     │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         WebAutopilot                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Orchestration Logic                       │    │
│  │  • Browser lifecycle management                              │    │
│  │  • Goal-based test selection                                 │    │
│  │  • Event emission for progress                               │    │
│  │  • Report generation coordination                            │    │
│  └─────────────────────────────────────────────────────────────┘    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   Crawler     │  │  Form Tests   │  │  Link Tests   │
│   (BFS)       │  │               │  │               │
└───────────────┘  └───────────────┘  └───────────────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             ▼
                    ┌───────────────┐
                    │   Evidence    │
                    │  Collector    │
                    └───────────────┘
                             │
                             ▼
                    ┌───────────────┐
                    │    Report     │
                    │   Writers     │
                    └───────────────┘
```

## Module Breakdown

### 1. CLI Package (`packages/cli`)

**Responsibility**: Command-line interface and user interaction.

#### Components:
- **index.ts**: Entry point, Commander.js setup
- **commands/run.ts**: Main run command logic
- **output/scorecard.ts**: Terminal scorecard display

#### Design Decisions:
- Uses Commander.js for robust argument parsing
- Supports repeatable `--goal` flags for multiple goals
- Colored output with chalk for better UX
- Progress spinner with ora for long operations

### 2. Core Package (`packages/core`)

The heart of the automation engine.

#### 2.1 Crawler (`src/crawler/`)

**Responsibility**: BFS exploration of the target website.

```
                    ┌─────────────┐
                    │  Start URL  │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    Queue    │◄──────┐
                    └──────┬──────┘       │
                           │              │
                           ▼              │
                    ┌─────────────┐       │
            ┌───────│ Visit Page  │       │
            │       └─────────────┘       │
            │              │              │
            ▼              ▼              │
    ┌───────────┐  ┌─────────────┐       │
    │  Capture  │  │  Extract    │───────┘
    │  Events   │  │  Links      │
    └───────────┘  └─────────────┘
```

**Key Features**:
- URL normalization before queueing
- Internal-only link following (unless `--allow-external`)
- Event capture during page load (console, network)
- Form detection per page

#### 2.2 Form Detection (`src/forms/detector.ts`)

**Responsibility**: Identify forms and infer field types.

**Field Type Inference**:
```
Input Signals → Inference Engine → Field Type
────────────────────────────────────────────
type="email"           ┐
name contains "email"  ├──→ email
label contains "email" ┘

type="tel"             ┐
name contains "phone"  ├──→ phone
name contains "tel"    ┘

type="password"        ┐
name contains "pass"   ├──→ password
```

**Required Field Detection**:
1. `required` attribute
2. `aria-required="true"`
3. Label contains `*`
4. Label contains "required"

#### 2.3 Form Tester (`src/forms/tester.ts`)

**Responsibility**: Validate form behavior.

**Test Sequence**:
```
1. Required Field Test
   └─→ Submit with empty required fields
   └─→ Check for validation feedback

2. Invalid Input Test
   └─→ Fill with invalid values (email: "a@", phone: "abc")
   └─→ Submit
   └─→ Check for error indication

3. Happy Path (if safe)
   └─→ Fill with valid values
   └─→ (Do not actually submit)
```

**Safety Checks**:
- Skip destructive buttons ("Delete", "Pay", "Cancel")
- Only test "safe" submit buttons ("Submit", "Send", "Contact")

#### 2.4 Link Checker (`src/links/checker.ts`)

**Responsibility**: Validate all discovered links.

**Process**:
1. Collect unique links from all pages
2. Check each via Playwright navigation
3. Flag 4xx/5xx responses
4. Report with source page information

**Optimizations**:
- Batch processing (5 links in parallel)
- Caching to avoid re-checking same URL
- `waitUntil: 'commit'` for faster checks

#### 2.5 A11y Checker (`src/a11y/checker.ts`)

**Responsibility**: Lightweight accessibility validation.

**Checks Performed**:
| Check | WCAG Criterion | Detection Method |
|-------|----------------|------------------|
| Missing input labels | 1.3.1 | No label, aria-label, or aria-labelledby |
| Missing button names | 4.1.2 | No text, aria-label, or title |
| Missing link names | 2.4.4 | No text or accessible name |
| Focus trap issues | 2.4.3 | Modal without aria-modal or focus management |

#### 2.6 Evidence Collector (`src/evidence/collector.ts`)

**Responsibility**: Capture proof of issues.

**Evidence Types**:
- Screenshots (viewport and full-page)
- Playwright traces
- Console log excerpts
- Network request details
- HTML snippets

#### 2.7 Report Writers (`src/reports/`)

**Responsibility**: Generate output files.

| Writer | Output | Use Case |
|--------|--------|----------|
| JsonReportWriter | report.json | Machine processing, CI integration |
| MarkdownReportWriter | bugs.md | GitHub issues, documentation |
| HtmlReportWriter | report.html | Human review, sharing |

#### 2.8 AI Summarizer (`src/ai/summarizer.ts`)

**Responsibility**: Optional AI-powered analysis.

**Features**:
- Executive summary generation
- Top risk identification
- Suggested fixes per issue
- Health score calculation

**Graceful Degradation**:
- Works without API key (fallback summary)
- Handles API failures silently
- Redacts sensitive URL parameters

## Data Flow

```
User Input → Config → Crawler → Pages[] → Tests → Issues[] → Reports
                                   │
                                   ▼
                            Evidence Collection
```

## Type System

The type system is designed around these core interfaces:

```typescript
// Configuration
RunConfig {
  url, maxPages, goals[], ...
}

// Page data from crawling
PageInfo {
  url, title, forms[], links[], consoleErrors[], networkErrors[]
}

// Form structure
FormInfo {
  selector, fields: FormField[], submitButton, isFormLike
}

// Discovered issues
Issue {
  id, severity, category, title, description,
  reproSteps[], evidence: Evidence
}

// Final report
Report {
  meta, crawl: CrawlResult, issues[], summary, aiSummary?
}
```

## Extension Points

### Adding a New Check Type

1. Create checker in `src/[name]/checker.ts`
2. Add types to `src/types.ts`
3. Register in `WebAutopilot.runTests()`
4. Add goal preset mapping

### Adding a New Report Format

1. Implement writer in `src/reports/[format]-writer.ts`
2. Export from `src/reports/index.ts`
3. Call from `WebAutopilot.writeReports()`

## Performance Considerations

- **Parallel Processing**: Link checks run in batches of 5
- **Early Termination**: Stops at `maxPages` limit
- **Efficient Navigation**: `waitUntil: 'domcontentloaded'` not `networkidle`
- **Resource Cleanup**: Pages closed after processing

## Security Model

1. **Domain Isolation**: Default same-host only
2. **Destructive Protection**: Skip dangerous form actions
3. **Secret Redaction**: Sensitive URL params hidden in reports
4. **No Data Exfiltration**: All data stays local
