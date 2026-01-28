# Testing Copilot-Style LLM Chat Applications

## Executive Summary

Web Autopilot extends traditional web QA automation to address the unique challenges of testing LLM-powered chat applications like Microsoft Copilot, ChatGPT, and enterprise AI assistants.

**Key Insight:** You can't test if an LLM's answer is "correct," but you CAN test:
- Does the response arrive in acceptable time?
- Is the JSON valid when JSON was requested?
- Does the UI remain responsive during streaming?
- Does the app handle network failures gracefully?
- Can users complete core workflows (new chat, regenerate, copy)?

This document outlines our approach to automated quality assurance for Copilot-style applications.

---

## The Challenge

Traditional web testing assumes deterministic behavior: click button → expect specific result. LLM applications break this assumption:

| Traditional Web App | LLM Chat App |
|---------------------|--------------|
| Deterministic outputs | Non-deterministic outputs |
| Instant responses | Streaming responses |
| Simple state | Complex conversation state |
| Standard forms | Natural language input |
| Static UI | Dynamic, streaming UI |

**We need a new testing paradigm.**

---

## Our Approach: Structure Over Semantics

Instead of testing "is this answer correct?", we test structural properties that indicate quality:

### 1. Response Structure Validation

```typescript
// DON'T: Assert exact content (flaky)
expect(response).toBe("The answer is 4");

// DO: Assert structural properties (reliable)
expect(response).toBeValidJSON();
expect(response).toContainCodeBlock();
expect(response.length).toBeGreaterThan(0);
expect(responseTime).toBeLessThan(3000);
```

### 2. Time to First Token (TTFT)

The most critical metric for perceived performance in streaming apps:

```
User clicks Send
      │
      ▼ ← Start timer
   [Loading...]
      │
      ▼ ← TTFT: First token appears
   [The w...]
      │
      ▼
   [The weather today...]
      │
      ▼ ← Total response time
   [Complete response]
```

**Threshold:** TTFT < 3 seconds for good UX

### 3. Chaos/Monkey Exploration

Autonomous random exploration finds edge cases humans miss:

```typescript
const chaos = new ChaosRunner(page, {
  seed: 12345,  // Reproducible!
  maxSteps: 100,
  allowedActions: ['click', 'type-prompt', 'refresh', 'scroll'],
  forbiddenSelectors: ['button:has-text("Delete")'],  // Safety
});

const result = await chaos.run();
// Checks: no blank screens, no crashes, no excessive errors
```

### 4. Reliability Under Adversity

LLM apps depend on external APIs. We test resilience:

```typescript
const injector = new NetworkInjector(page);

// Test offline handling
await injector.applyCondition('offline');
await sendMessage();
// Assert: error message shown, retry button available

// Test rate limiting
await injector.enableErrorInjection(429);
await sendMessage();
// Assert: graceful degradation, no crash

// Test slow networks
await injector.applyCondition('slow3G');
await sendMessage();
// Assert: loading indicators, no UI freeze
```

---

## Module Overview

### LLM Testing Modules

| Module | Purpose |
|--------|---------|
| `ChaosRunner` | Autonomous random exploration with seeded PRNG |
| `StreamingValidator` | TTFT measurement, stop button testing, UI responsiveness |
| `ChatFlowChecker` | Core UX flows: new chat, send, regenerate, copy |
| `PromptCorpusTester` | Structural validation of responses by format |

### Response Validators

| Validator | Checks |
|-----------|--------|
| `JsonValidator` | Valid JSON, expected fields, auto-repair |
| `MarkdownValidator` | Balanced code blocks, valid tables, proper headings |
| `CodeBlockValidator` | Language tags, balanced brackets, basic syntax |
| `ConsoleErrorValidator` | Error thresholds, filtered noise, known issues |

### Reliability Testing

| Module | Purpose |
|--------|---------|
| `NetworkInjector` | Simulate offline, slow, flaky, error responses |
| `PerformanceMetrics` | TTFT trends, memory leak detection, scroll performance |

---

## Test Categories

### 1. Smoke Tests (Fast, Every PR)

```
tests/smoke/
├── chat-send.test.ts      # Can send a message and get response
├── new-chat.test.ts       # Can create new conversation
├── response-renders.test.ts # Response is non-empty and visible
└── no-console-errors.test.ts # No JavaScript errors
```

### 2. Reliability Tests (Nightly)

```
tests/reliability/
├── offline-handling.test.ts
├── rate-limit-429.test.ts
├── server-error-500.test.ts
├── slow-network.test.ts
└── websocket-disconnect.test.ts
```

### 3. Chaos Tests (Nightly, Seeded)

```
tests/chaos/
├── random-exploration.test.ts  # --seed 12345
├── rapid-interactions.test.ts
└── state-corruption.test.ts
```

### 4. Performance Tests (Weekly)

```
tests/performance/
├── ttft-measurement.test.ts
├── memory-leak-smoke.test.ts
└── scroll-performance.test.ts
```

### 5. Prompt Corpus Tests (Weekly)

```
tests/corpus/
├── json-output.test.ts
├── code-generation.test.ts
├── list-formatting.test.ts
└── table-generation.test.ts
```

---

## Metrics Dashboard

### Key Performance Indicators

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| TTFT (p50) | < 1.5s | > 3s |
| TTFT (p95) | < 3s | > 5s |
| Error rate | < 1% | > 5% |
| Console errors | 0 | > 10 per session |
| Memory growth | < 50MB/100 msgs | > 100MB |
| Scroll FPS | > 30 | < 20 |

### Trend Tracking

```
TTFT Trend (Last 30 Days)
──────────────────────────
  3s │
     │    ╭───╮
  2s │────╯   ╰───────────
     │
  1s │────────────────────
     │
  0s └────────────────────
       Week 1  Week 2  Week 3  Week 4
```

---

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: LLM App Quality

on:
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'  # Nightly at 2 AM

jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm test:smoke

  reliability:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm test:reliability

  chaos:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm test:chaos --seed ${{ github.run_id }}
```

---

## Application to Microsoft Copilot

### Copilot-Specific Test Scenarios

1. **Multi-Modal Input**
   - File upload → preview renders → context used in response
   - Image paste → recognition → relevant response

2. **Enterprise Features**
   - Tenant switching → correct data isolation
   - Role-based features → premium features gated correctly
   - Session timeout → graceful re-authentication

3. **M365 Integration**
   - SharePoint context → document references accurate
   - Teams integration → thread context preserved
   - Outlook integration → email summarization works

4. **Streaming Behavior**
   - Token-by-token render → no UI freeze
   - Stop button → actually stops generation
   - Network interrupt → graceful recovery

### Copilot Test Configuration

```typescript
const copilotConfig: ChatFlowConfig = {
  selectors: {
    chatInput: '[data-testid="copilot-input"]',
    sendButton: '[data-testid="copilot-send"]',
    stopButton: '[data-testid="copilot-stop"]',
    responseContainer: '[data-testid="copilot-response"]',
    newChatButton: '[data-testid="new-conversation"]',
  },
  timeouts: {
    responseWait: 30000,
    ttftThreshold: 3000,
  },
};
```

---

## Why This Matters

### The Problem with Manual Testing

- **Non-deterministic:** Same prompt → different responses → can't automate naively
- **Slow feedback:** Manual testers can't keep up with deployment velocity
- **Missing edge cases:** Humans don't think to test "what if network drops mid-stream?"
- **No regression detection:** "Was TTFT always this slow, or did it regress?"

### Our Solution

| Challenge | Solution |
|-----------|----------|
| Non-deterministic outputs | Test structure, not content |
| Slow feedback | Automated smoke tests on every PR |
| Missing edge cases | Chaos runner with seeded exploration |
| No regression detection | TTFT trending, memory monitoring |

### Business Impact

- **Faster releases:** Confidence to ship daily
- **Better UX:** Catch performance regressions before users do
- **Reduced support tickets:** Find reliability issues in CI, not production
- **Competitive advantage:** Enterprise-grade quality assurance

---

## Getting Started

### Quick Start

```typescript
import {
  ChaosRunner,
  StreamingValidator,
  PromptCorpusTester,
  NetworkInjector,
  PerformanceMetrics,
} from '@web-autopilot/core';

// Initialize
const page = await browser.newPage();
await page.goto('https://your-copilot-app.com');

// Run chaos exploration
const chaos = new ChaosRunner(page, { seed: 12345, maxSteps: 50 });
const chaosResult = await chaos.run();

// Validate streaming
const streaming = new StreamingValidator(page);
const streamResult = await streaming.validate();

// Test response formats
const corpus = new PromptCorpusTester(page);
const corpusResult = await corpus.runAll();

// Test reliability
const network = new NetworkInjector(page);
const reliabilityResult = await network.runReliabilityTests(
  async () => { await sendPrompt(page, 'Hello'); }
);

// Measure performance
const perf = new PerformanceMetrics(page);
const perfReport = await perf.generateReport(
  async () => { await sendPrompt(page, 'Hello'); },
  { measureTTFT: true, measureMemory: true }
);
```

---

## Roadmap

### Phase 1: Foundation ✅
- [x] Chaos Runner with seeded PRNG
- [x] Streaming Validator with TTFT
- [x] Chat Flow Checker
- [x] Prompt Corpus Tester
- [x] Response Validators (JSON, Markdown, Code)
- [x] Network Injector
- [x] Performance Metrics

### Phase 2: Enterprise Features
- [ ] Azure AD authentication support
- [ ] Multi-tenant testing
- [ ] SharePoint integration tests
- [ ] Teams context validation

### Phase 3: Intelligence
- [ ] AI-powered test generation
- [ ] Anomaly detection in metrics
- [ ] Self-healing selectors
- [ ] Visual regression for streamed content

### Phase 4: Platform
- [ ] Web dashboard for metrics
- [ ] Slack/Teams alerting
- [ ] Historical trend analysis
- [ ] Custom rule engine

---

## Conclusion

Testing Copilot-style LLM applications requires a paradigm shift from traditional web testing. By focusing on **structure over semantics**, **reliability under adversity**, and **autonomous exploration**, we can achieve enterprise-grade quality assurance for the next generation of AI-powered applications.

Web Autopilot provides the foundation. The patterns and tools in this document represent our approach to ensuring Microsoft Copilot and similar applications deliver consistent, reliable, and performant experiences to users.

---

*Document Version: 1.0*
*Last Updated: January 2026*
