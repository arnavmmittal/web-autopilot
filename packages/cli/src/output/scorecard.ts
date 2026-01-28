/**
 * Terminal scorecard output
 */

import chalk from 'chalk';

import type { Report, RunConfig, IssueSeverity } from '@web-autopilot/core';

const SEVERITY_COLORS: Record<IssueSeverity, (text: string) => string> = {
  critical: chalk.red.bold,
  high: chalk.red,
  medium: chalk.yellow,
  low: chalk.blue,
  info: chalk.gray,
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

export function printScorecard(report: Report, config: RunConfig): void {
  const { summary, issues } = report;
  const width = 60;

  console.log('\n' + chalk.cyan.bold('═'.repeat(width)));
  console.log(chalk.cyan.bold(' 📊 SCORECARD'));
  console.log(chalk.cyan.bold('═'.repeat(width)));

  // Pages section
  console.log('\n' + chalk.bold.white('📄 Pages'));
  console.log(
    chalk.gray('  Visited: ') +
      chalk.white(`${summary.totalPagesVisited}/${config.maxPages}`) +
      (summary.maxPagesReached ? chalk.yellow(' (limit reached)') : '')
  );

  // Forms section
  console.log('\n' + chalk.bold.white('📝 Forms'));
  console.log(chalk.gray('  Discovered: ') + chalk.white(summary.formsDiscovered));
  console.log(chalk.gray('  Tested: ') + chalk.white(summary.formsTested));

  // Issues section
  console.log('\n' + chalk.bold.white('🐛 Issues'));
  console.log(chalk.gray('  Total: ') + chalk.white.bold(summary.totalIssues));

  // Issues by severity
  const severities: IssueSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
  for (const severity of severities) {
    const count = summary.issuesBySeverity[severity] || 0;
    if (count > 0) {
      console.log(
        chalk.gray(`  ${severity.charAt(0).toUpperCase() + severity.slice(1)}: `) +
          SEVERITY_COLORS[severity](String(count))
      );
    }
  }

  // Issues by category
  console.log('\n' + chalk.bold.white('  By Category:'));
  for (const [category, count] of Object.entries(summary.issuesByCategory)) {
    if (count > 0) {
      console.log(chalk.gray(`    ${category}: `) + chalk.white(count));
    }
  }

  // Top 3 issues
  if (summary.topIssues.length > 0) {
    console.log('\n' + chalk.bold.white('⚠️  Top Issues'));
    const topIssues = summary.topIssues.slice(0, 3);
    for (let i = 0; i < topIssues.length; i++) {
      const issue = topIssues[i];
      const severityColor = SEVERITY_COLORS[issue.severity];
      console.log(
        chalk.gray(`  ${i + 1}. `) +
          severityColor(`[${issue.severity.toUpperCase()}]`) +
          ' ' +
          chalk.white(truncate(issue.title, 40))
      );
      console.log(chalk.gray(`     ${truncate(issue.pageUrl, 50)}`));
    }
  }

  // Output paths
  console.log('\n' + chalk.bold.white('📁 Output'));
  console.log(chalk.gray('  Report (HTML): ') + chalk.cyan(`${config.outputDir}/report.html`));
  console.log(chalk.gray('  Report (JSON): ') + chalk.cyan(`${config.outputDir}/report.json`));
  console.log(chalk.gray('  Bugs (MD):     ') + chalk.cyan(`${config.outputDir}/bugs.md`));
  console.log(chalk.gray('  Artifacts:     ') + chalk.cyan(`${config.outputDir}/artifacts/`));

  // Duration
  console.log('\n' + chalk.gray('⏱️  Duration: ') + chalk.white(formatDuration(summary.durationMs)));

  // AI Summary indicator
  if (report.aiSummary) {
    console.log('\n' + chalk.green('✨ AI Summary included in reports'));
  } else if (!config.openaiApiKey) {
    console.log('\n' + chalk.gray('💡 Set OPENAI_API_KEY to enable AI summaries'));
  }

  console.log('\n' + chalk.cyan.bold('═'.repeat(width)) + '\n');
}
