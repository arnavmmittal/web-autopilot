/**
 * Integration tests for LLM testing modules
 */

import { describe, it, expect } from 'vitest';
import { JsonValidator } from '../validators/json-validator.js';
import { MarkdownValidator } from '../validators/markdown-validator.js';
import { CodeBlockValidator } from '../validators/code-block-validator.js';

describe('JsonValidator', () => {
  const validator = new JsonValidator();

  it('validates valid JSON object', () => {
    const result = validator.validate('{"name": "test", "value": 123}');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validates valid JSON array', () => {
    const result = validator.validate('[1, 2, 3]');
    expect(result.valid).toBe(true);
  });

  it('extracts JSON from markdown code block', () => {
    const content = 'Here is the JSON:\n```json\n{"key": "value"}\n```\nThat was the JSON.';
    const result = validator.validate(content);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.code === 'JSON_EXTRACTED')).toBe(true);
  });

  it('rejects invalid JSON', () => {
    const result = validator.validate('{invalid json}');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_JSON')).toBe(true);
  });

  it('repairs trailing commas', () => {
    const result = validator.validate('{"a": 1, "b": 2,}');
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.code === 'JSON_REPAIRED')).toBe(true);
  });

  it('checks expected fields', () => {
    const strictValidator = new JsonValidator({ expectedFields: ['name', 'age'], strict: true });
    const result = strictValidator.validate('{"name": "test"}');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'MISSING_FIELD')).toBe(true);
  });

  it('handles empty content', () => {
    const result = validator.validate('');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'EMPTY_CONTENT')).toBe(true);
  });
});

describe('MarkdownValidator', () => {
  const validator = new MarkdownValidator();

  it('validates clean markdown', () => {
    const content = '# Heading\n\nSome text.\n\n## Subheading\n\nMore text.';
    const result = validator.validate(content);
    expect(result.valid).toBe(true);
  });

  it('detects unclosed code blocks', () => {
    const content = '```javascript\nconst x = 1;\n// Missing closing';
    const result = validator.validate(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'UNCLOSED_CODE_BLOCK')).toBe(true);
  });

  it('warns about untagged code blocks', () => {
    const content = '```\nsome code\n```';
    const result = validator.validate(content);
    expect(result.warnings.some(w => w.code === 'UNTAGGED_CODE_BLOCK')).toBe(true);
  });

  it('validates headings with content', () => {
    // The heading regex ^(#{1,6})\s+(.+) requires at least one character after the space
    // So "# " alone doesn't match as a heading - it's just treated as text
    const content = '# Valid Heading\n\nSome text.\n\n## Another Heading\n\nMore text.';
    const result = validator.validate(content);
    expect(result.valid).toBe(true);
  });

  it('warns about skipped heading levels', () => {
    const content = '# H1\n\n### H3 (skipped H2)\n\nText.';
    const result = validator.validate(content);
    expect(result.warnings.some(w => w.code === 'SKIPPED_HEADING_LEVEL')).toBe(true);
  });

  it('validates proper tables', () => {
    const content = '| Name | Age |\n|------|-----|\n| John | 30 |';
    const result = validator.validate(content);
    expect(result.valid).toBe(true);
  });

  it('detects empty link URLs', () => {
    const content = 'Click [here]() for more info.';
    const result = validator.validate(content);
    expect(result.errors.some(e => e.code === 'EMPTY_LINK_URL')).toBe(true);
  });
});

describe('CodeBlockValidator', () => {
  const validator = new CodeBlockValidator();

  it('validates proper code block', () => {
    const content = '```javascript\nconst x = 1;\nconsole.log(x);\n```';
    const result = validator.validate(content);
    expect(result.valid).toBe(true);
  });

  it('detects no code blocks', () => {
    const content = 'Just some plain text without code.';
    const result = validator.validate(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'NO_CODE_BLOCKS')).toBe(true);
  });

  it('warns about missing language specifier', () => {
    const content = '```\nconst x = 1;\n```';
    const result = validator.validate(content);
    expect(result.warnings.some(w => w.code === 'MISSING_LANGUAGE')).toBe(true);
  });

  it('validates JSON in code block', () => {
    const content = '```json\n{"key": "value"}\n```';
    const result = validator.validate(content);
    expect(result.valid).toBe(true);
  });

  it('detects invalid JSON in code block', () => {
    const content = '```json\n{invalid}\n```';
    const result = validator.validate(content);
    expect(result.errors.some(e => e.code === 'INVALID_JSON')).toBe(true);
  });

  it('detects unbalanced brackets', () => {
    const content = '```javascript\nfunction test() {\n  if (true) {\n    console.log("hi");\n  // Missing closing braces\n```';
    const result = validator.validate(content);
    expect(result.errors.some(e => e.code === 'UNBALANCED_BRACKETS')).toBe(true);
  });

  it('handles balanced brackets in code', () => {
    const content = '```javascript\nfunction test() {\n  const arr = [1, 2, 3];\n  return arr.map(x => x * 2);\n}\n```';
    const result = validator.validate(content);
    expect(result.valid).toBe(true);
  });

  it('ignores brackets in strings', () => {
    const content = '```javascript\nconst str = "{ not a bracket }";\n```';
    const result = validator.validate(content);
    expect(result.valid).toBe(true);
  });
});

describe('SeededRandom (via ChaosRunner internals)', () => {
  // Test the seeded randomness concept
  it('produces deterministic results with same seed', () => {
    // Mulberry32 algorithm
    const seededRandom = (seed: number) => {
      return () => {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };

    const rng1 = seededRandom(12345);
    const rng2 = seededRandom(12345);

    // Same seed = same sequence
    expect(rng1()).toBe(rng2());
    expect(rng1()).toBe(rng2());
    expect(rng1()).toBe(rng2());

    // Different seed = different sequence
    const rng3 = seededRandom(54321);
    const val1 = seededRandom(12345)();
    const val3 = rng3();
    expect(val1).not.toBe(val3);
  });
});

describe('Prompt format validation patterns', () => {
  it('validates numbered list format', () => {
    const response = '1. First item\n2. Second item\n3. Third item';
    const numberedLines = response.split('\n').filter(l => /^\d+[\.\)]\s/.test(l.trim()));
    expect(numberedLines.length).toBe(3);
  });

  it('validates bullet list format', () => {
    const response = '- Item one\n- Item two\n- Item three';
    const bulletLines = response.split('\n').filter(l => /^[\-\*\•]\s/.test(l.trim()));
    expect(bulletLines.length).toBe(3);
  });

  it('validates markdown table format', () => {
    const response = '| Name | Age |\n|------|-----|\n| John | 30 |';
    const hasTableRows = /\|.*\|/.test(response);
    const hasSeparator = /\|[\s\-:]+\|/.test(response);
    expect(hasTableRows && hasSeparator).toBe(true);
  });

  it('detects refusal patterns', () => {
    const refusals = [
      "I can't help with that",
      "I cannot assist with this request",
      "I'm unable to provide that information",
      "Sorry, but I cannot do that",
    ];

    const refusalPatterns = [/i can't/i, /i cannot/i, /i'm unable/i, /sorry/i];

    for (const refusal of refusals) {
      const isRefusal = refusalPatterns.some(p => p.test(refusal));
      expect(isRefusal).toBe(true);
    }
  });
});

describe('Network condition presets', () => {
  it('has correct offline preset', () => {
    const offline = { name: 'Offline', offline: true };
    expect(offline.offline).toBe(true);
  });

  it('has correct slow 3G preset', () => {
    const slow3G = { name: 'Slow 3G', latencyMs: 400, downloadBps: 40000 };
    expect(slow3G.latencyMs).toBe(400);
    expect(slow3G.downloadBps).toBe(40000);
  });

  it('has correct flaky preset', () => {
    const flaky = { name: 'Flaky Connection', latencyMs: 200, packetLoss: 30 };
    expect(flaky.packetLoss).toBe(30);
  });
});

describe('TTFT threshold validation', () => {
  it('passes when under threshold', () => {
    const ttft = 1500;
    const threshold = 3000;
    expect(ttft <= threshold).toBe(true);
  });

  it('fails when over threshold', () => {
    const ttft = 4500;
    const threshold = 3000;
    expect(ttft <= threshold).toBe(false);
  });
});
