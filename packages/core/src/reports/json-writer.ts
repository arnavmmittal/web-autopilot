/**
 * JSON Report Writer - machine-readable output
 */

import { writeFile } from 'fs/promises';

import type { Report } from '../types.js';

export class JsonReportWriter {
  /**
   * Write report to JSON file
   */
  async write(report: Report, filepath: string): Promise<void> {
    const json = JSON.stringify(report, null, 2);
    await writeFile(filepath, json, 'utf-8');
  }
}
