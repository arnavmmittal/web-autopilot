# Web Autopilot 🚀

A Copilot-like Playwright automation tool that explores websites and produces comprehensive bug reports with evidence.

[![CI](https://github.com/web-autopilot/web-autopilot/actions/workflows/ci.yml/badge.svg)](https://github.com/web-autopilot/web-autopilot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

## ✨ Features

- **Intelligent Crawling** - BFS exploration with configurable page limits
- **Form Testing** - Validates required fields, input formats, and error handling
- **Link Checking** - Detects broken links (4xx/5xx responses)
- **Console Monitoring** - Captures JavaScript errors and failed network requests
- **Accessibility Checks** - Lightweight a11y validation (missing labels, names, focus traps)
- **Evidence Collection** - Screenshots, traces, and detailed repro steps
- **AI Summarization** - Optional GPT-powered executive summaries (requires OPENAI_API_KEY)
- **Multiple Output Formats** - JSON, Markdown (GitHub-ready), and HTML reports

## 🎬 60-Second Demo

```bash
# Clone and install
git clone https://github.com/web-autopilot/web-autopilot.git
cd web-autopilot
pnpm install

# Install Playwright browsers
pnpm exec playwright install chromium

# Build the project
pnpm build

# Run the demo
npx web-autopilot demo

# Or run against any site
npx web-autopilot run --url https://example.com --goal forms --goal links
```

The demo runs against [The Internet](https://the-internet.herokuapp.com) (a stable test site) and generates reports in `examples/demo-output/`.

## 📦 Installation

```bash
# Using npx (no install required)
npx web-autopilot run --url https://your-site.com

# Or install globally
npm install -g web-autopilot
web-autopilot run --url https://your-site.com

# Or in a project
npm install --save-dev web-autopilot
```

## 🎯 Usage

### Basic Usage

```bash
# Full scan with all checks
web-autopilot run --url https://example.com

# Specific checks only
web-autopilot run --url https://example.com --goal forms --goal links

# Custom configuration
web-autopilot run \
  --url https://example.com \
  --max-pages 30 \
  --timeout-ms 45000 \
  --output ./my-report \
  --report-title "Q1 Security Audit"
```

### Goal Presets

| Preset | Description |
|--------|-------------|
| `forms` | Test form validation (required fields, input formats) |
| `links` | Check for broken links (4xx/5xx) |
| `console` | Capture console errors and failed requests |
| `a11y-lite` | Basic accessibility checks |
| `full` | All of the above (default) |

You can also use custom free-text goals:
```bash
web-autopilot run --url https://example.com --goal "Find all contact forms"
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `-u, --url <url>` | Target URL (required) | - |
| `-m, --max-pages <n>` | Maximum pages to visit | 50 |
| `-t, --timeout-ms <n>` | Page timeout in ms | 30000 |
| `--headed` | Run browser visibly | false |
| `-o, --output <dir>` | Output directory | ./output |
| `--allow-external` | Crawl external links | false |
| `--allow-destructive` | Allow destructive form actions | false |
| `-g, --goal <goal>` | Testing goal (repeatable) | full |
| `--report-title <title>` | Report title | Web Autopilot Report |
| `--demo` | Run in demo mode | false |

### Demo Mode

```bash
# Quick demo against a stable test site
web-autopilot demo

# Demo with visible browser
web-autopilot demo --headed
```

## 📊 Output

After a run, you'll find these files in your output directory:

```
output/
├── report.html      # Human-friendly report with navigation
├── report.json      # Machine-readable full report
├── bugs.md          # GitHub issue-ready markdown
└── artifacts/
    ├── screenshots/ # Issue screenshots
    └── traces/      # Playwright traces
```

### Terminal Scorecard

At the end of each run, a summary scorecard is displayed:

```
═══════════════════════════════════════════════════════════
 📊 SCORECARD
═══════════════════════════════════════════════════════════

📄 Pages
  Visited: 15/50

📝 Forms
  Discovered: 8
  Tested: 8

🐛 Issues
  Total: 12
  High: 3
  Medium: 7
  Low: 2

⚠️  Top Issues
  1. [HIGH] Missing required field validation
     https://example.com/contact
  2. [HIGH] Broken link: HTTP 404
     https://example.com/about
  3. [MEDIUM] Input missing accessible label
     https://example.com/login

📁 Output
  Report (HTML): ./output/report.html
  Report (JSON): ./output/report.json
  Bugs (MD):     ./output/bugs.md
  Artifacts:     ./output/artifacts/

⏱️  Duration: 45.2s

═══════════════════════════════════════════════════════════
```

## 🤖 AI Summarization

Set `OPENAI_API_KEY` to enable AI-powered analysis:

```bash
export OPENAI_API_KEY=sk-...
web-autopilot run --url https://example.com
```

AI features:
- Executive summary of findings
- Top risks identification
- Suggested fixes per issue
- Overall health score (0-100)

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                         CLI                              │
│  (Commander.js, Progress display, Scorecard)            │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                    WebAutopilot                         │
│  (Main orchestrator - manages workflow and reporting)   │
└────┬────────┬────────┬────────┬────────┬────────┬──────┘
     │        │        │        │        │        │
┌────▼──┐ ┌───▼───┐ ┌──▼───┐ ┌──▼──┐ ┌───▼──┐ ┌───▼────┐
│Crawler│ │FormDet│ │FormT │ │Link │ │ A11y │ │Evidence│
│  BFS  │ │ector  │ │ester │ │Check│ │Checker│ │Collect │
└───────┘ └───────┘ └──────┘ └─────┘ └──────┘ └────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                   Report Writers                         │
│  (JSON, Markdown, HTML) + Optional AI Summarizer        │
└─────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
web-autopilot/
├── packages/
│   ├── core/           # Core automation library
│   │   └── src/
│   │       ├── crawler/    # BFS web crawler
│   │       ├── forms/      # Form detection & testing
│   │       ├── links/      # Link validation
│   │       ├── a11y/       # Accessibility checks
│   │       ├── evidence/   # Screenshots & traces
│   │       ├── reports/    # Report writers
│   │       ├── ai/         # AI summarization
│   │       └── utils/      # URL normalization, etc.
│   └── cli/            # Command-line interface
├── examples/
│   └── demo-output/    # Sample output from demo mode
├── docs/
│   └── ARCHITECTURE.md # Detailed architecture docs
└── .github/
    └── workflows/      # CI/CD pipelines
```

## 🧪 Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm format
```

## 🔒 Safety Features

- **Domain Isolation** - Stays on the same host by default
- **Destructive Action Protection** - Skips "Delete", "Pay", "Unsubscribe" buttons
- **Rate Limiting** - Configurable timeouts prevent overwhelming targets
- **No Secrets in Reports** - Query parameters with sensitive names are redacted

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- Built with [Playwright](https://playwright.dev/)
- AI powered by [OpenAI](https://openai.com/)
- Inspired by the need for automated web quality assurance

---

Made with ❤️ by the Web Autopilot team
