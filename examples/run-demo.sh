#!/bin/bash
# Demo script for Web Autopilot
# This script runs web-autopilot in demo mode against a stable test site

set -e

echo "🚀 Web Autopilot Demo"
echo "====================="
echo ""

# Navigate to project root
cd "$(dirname "$0")/.."

# Check if built
if [ ! -f "packages/cli/dist/index.js" ]; then
  echo "📦 Building project..."
  pnpm build
fi

# Run demo
echo "🔍 Running demo against https://the-internet.herokuapp.com"
echo ""

node packages/cli/dist/index.js demo --headed

echo ""
echo "✅ Demo complete!"
echo ""
echo "📊 View reports at:"
echo "   - HTML:     examples/demo-output/report.html"
echo "   - JSON:     examples/demo-output/report.json"
echo "   - Markdown: examples/demo-output/bugs.md"
