#!/usr/bin/env node
/**
 * Web Autopilot CLI
 * A Copilot-like Playwright automation tool for website exploration and bug reporting
 */

import { Command } from 'commander';

import { runCommand } from './commands/run.js';
import { VERSION } from './version.js';

const program = new Command();

program
  .name('web-autopilot')
  .description('A Copilot-like Playwright automation tool for website exploration and bug reporting')
  .version(VERSION);

program
  .command('run')
  .description('Run web-autopilot against a target URL')
  .requiredOption('-u, --url <url>', 'Target URL to crawl and test')
  .option('-m, --max-pages <number>', 'Maximum pages to visit', '50')
  .option('-t, --timeout-ms <number>', 'Page timeout in milliseconds', '30000')
  .option('--headed', 'Run browser in headed mode', false)
  .option('-o, --output <dir>', 'Output directory', './output')
  .option('--allow-external', 'Allow crawling external links', false)
  .option('--allow-destructive', 'Allow destructive form actions', false)
  .option(
    '-g, --goal <goal>',
    'Testing goal (forms, links, console, a11y-lite, full, or custom text). Can be specified multiple times.',
    (value: string, previous: string[]) => previous.concat([value]),
    [] as string[]
  )
  .option('--report-title <title>', 'Report title', 'Web Autopilot Report')
  .option('--demo', 'Run in demo mode with default demo site', false)
  .action(runCommand);

// Add demo as a shortcut command
program
  .command('demo')
  .description('Run web-autopilot in demo mode against a stable test site')
  .option('-o, --output <dir>', 'Output directory', './examples/demo-output')
  .option('--headed', 'Run browser in headed mode', false)
  .action((options) => {
    return runCommand({
      ...options,
      demo: true,
      url: 'https://the-internet.herokuapp.com',
      maxPages: '10',
      timeoutMs: '15000',
      goal: ['full'],
      reportTitle: 'Web Autopilot Demo Report',
    });
  });

program.parse();
