/**
 * Run command implementation
 */

import chalk from 'chalk';
import ora from 'ora';

import type { Goal, GoalPreset, RunConfig, AutopilotEvent } from '@web-autopilot/core';
import { DEFAULT_CONFIG, DEMO_CONFIG, WebAutopilot } from '@web-autopilot/core';

import { printScorecard } from '../output/scorecard.js';

interface RunOptions {
  url: string;
  maxPages: string;
  timeoutMs: string;
  headed: boolean;
  output: string;
  allowExternal: boolean;
  allowDestructive: boolean;
  goal: string[];
  reportTitle: string;
  demo: boolean;
}

const GOAL_PRESETS: GoalPreset[] = ['forms', 'links', 'console', 'a11y-lite', 'full'];

function parseGoals(goalStrings: string[]): Goal[] {
  if (goalStrings.length === 0) {
    return [{ type: 'preset', value: 'full' }];
  }

  return goalStrings.map((goal) => {
    const normalized = goal.toLowerCase().trim();
    if (GOAL_PRESETS.includes(normalized as GoalPreset)) {
      return { type: 'preset' as const, value: normalized as GoalPreset };
    }
    return { type: 'custom' as const, value: goal };
  });
}

function buildConfig(options: RunOptions): RunConfig {
  const baseConfig = options.demo ? DEMO_CONFIG : DEFAULT_CONFIG;

  return {
    ...baseConfig,
    url: options.url,
    maxPages: parseInt(options.maxPages, 10),
    timeoutMs: parseInt(options.timeoutMs, 10),
    headed: options.headed,
    outputDir: options.output,
    allowExternal: options.allowExternal,
    allowDestructive: options.allowDestructive,
    goals: parseGoals(options.goal),
    reportTitle: options.reportTitle,
    demo: options.demo,
    openaiApiKey: process.env.OPENAI_API_KEY,
  } as RunConfig;
}

export async function runCommand(options: RunOptions): Promise<void> {
  const config = buildConfig(options);

  // Print banner
  console.log(chalk.bold.cyan('\n🚀 Web Autopilot'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.white(`Target: ${chalk.bold(config.url)}`));
  console.log(chalk.white(`Max Pages: ${config.maxPages}`));
  console.log(
    chalk.white(
      `Goals: ${config.goals.map((g) => (g.type === 'preset' ? g.value : `"${g.value}"`)).join(', ')}`
    )
  );
  console.log(chalk.white(`Output: ${config.outputDir}`));
  if (config.demo) {
    console.log(chalk.yellow('Mode: Demo'));
  }
  console.log(chalk.gray('─'.repeat(50)) + '\n');

  const spinner = ora({ text: 'Initializing...', color: 'cyan' }).start();

  try {
    const autopilot = new WebAutopilot(config);

    // Set up event handlers for progress
    autopilot.on('page-visit', (event: AutopilotEvent) => {
      const data = event.data as { url: string; current: number; total: number };
      spinner.text = `Visiting page ${data.current}/${data.total}: ${data.url}`;
    });

    autopilot.on('form-found', (event: AutopilotEvent) => {
      const data = event.data as { count: number };
      spinner.text = `Found ${data.count} forms...`;
    });

    autopilot.on('form-test-start', (event: AutopilotEvent) => {
      const data = event.data as { formIndex: number; total: number };
      spinner.text = `Testing form ${data.formIndex}/${data.total}...`;
    });

    autopilot.on('issue-found', (event: AutopilotEvent) => {
      const data = event.data as { category: string; title: string };
      spinner.info(chalk.yellow(`Issue found: [${data.category}] ${data.title}`));
      spinner.start();
    });

    autopilot.on('link-check', (event: AutopilotEvent) => {
      const data = event.data as { checked: number; total: number };
      spinner.text = `Checking links: ${data.checked}/${data.total}`;
    });

    autopilot.on('a11y-check', () => {
      spinner.text = 'Running accessibility checks...';
    });

    spinner.text = 'Starting crawl...';
    const report = await autopilot.run();

    spinner.succeed('Crawl complete!');

    // Print scorecard
    printScorecard(report, config);
  } catch (error) {
    spinner.fail('Error during execution');
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
