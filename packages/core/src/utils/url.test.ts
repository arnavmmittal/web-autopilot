import { describe, it, expect } from 'vitest';

import {
  normalizeUrl,
  isSameUrl,
  isSameHost,
  isInternalUrl,
  isNavigableUrl,
  getBaseDomain,
  toAbsoluteUrl,
  redactSensitiveParams,
} from './url.js';

describe('normalizeUrl', () => {
  it('should remove fragments', () => {
    expect(normalizeUrl('https://example.com/page#section')).toBe('https://example.com/page');
  });

  it('should remove trailing slashes except for root', () => {
    expect(normalizeUrl('https://example.com/page/')).toBe('https://example.com/page');
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('should lowercase hostname', () => {
    expect(normalizeUrl('https://EXAMPLE.COM/Page')).toBe('https://example.com/Page');
  });

  it('should remove default ports', () => {
    expect(normalizeUrl('https://example.com:443/page')).toBe('https://example.com/page');
    expect(normalizeUrl('http://example.com:80/page')).toBe('http://example.com/page');
    expect(normalizeUrl('https://example.com:8080/page')).toBe('https://example.com:8080/page');
  });

  it('should sort query parameters', () => {
    expect(normalizeUrl('https://example.com?z=1&a=2')).toBe('https://example.com/?a=2&z=1');
  });

  it('should handle relative URLs with base', () => {
    expect(normalizeUrl('/page', 'https://example.com')).toBe('https://example.com/page');
  });

  it('should return original string for invalid URLs', () => {
    expect(normalizeUrl('not-a-url')).toBe('not-a-url');
  });
});

describe('isSameUrl', () => {
  it('should return true for same URLs after normalization', () => {
    expect(isSameUrl('https://example.com/page#a', 'https://example.com/page#b')).toBe(true);
    expect(isSameUrl('https://EXAMPLE.COM/page', 'https://example.com/page')).toBe(true);
  });

  it('should return false for different URLs', () => {
    expect(isSameUrl('https://example.com/page1', 'https://example.com/page2')).toBe(false);
  });
});

describe('isSameHost', () => {
  it('should return true for same host', () => {
    expect(isSameHost('https://example.com/page', 'https://example.com')).toBe(true);
    expect(isSameHost('/page', 'https://example.com')).toBe(true);
  });

  it('should return false for different hosts', () => {
    expect(isSameHost('https://other.com/page', 'https://example.com')).toBe(false);
  });

  it('should handle case differences', () => {
    expect(isSameHost('https://EXAMPLE.COM/page', 'https://example.com')).toBe(true);
  });
});

describe('isInternalUrl', () => {
  it('should return true for internal URLs', () => {
    expect(isInternalUrl('/page', 'https://example.com')).toBe(true);
    expect(isInternalUrl('https://example.com/other', 'https://example.com')).toBe(true);
  });

  it('should return false for external URLs', () => {
    expect(isInternalUrl('https://other.com/page', 'https://example.com')).toBe(false);
  });

  it('should return false for non-http protocols', () => {
    expect(isInternalUrl('mailto:test@example.com', 'https://example.com')).toBe(false);
    expect(isInternalUrl('javascript:void(0)', 'https://example.com')).toBe(false);
  });
});

describe('isNavigableUrl', () => {
  it('should return true for navigable URLs', () => {
    expect(isNavigableUrl('https://example.com/page')).toBe(true);
    expect(isNavigableUrl('http://example.com/page.html')).toBe(true);
  });

  it('should return false for non-navigable URLs', () => {
    expect(isNavigableUrl('mailto:test@example.com')).toBe(false);
    expect(isNavigableUrl('https://example.com/file.pdf')).toBe(false);
    expect(isNavigableUrl('https://example.com/image.jpg')).toBe(false);
    expect(isNavigableUrl('https://example.com/video.mp4')).toBe(false);
  });

  it('should handle relative URLs with base', () => {
    expect(isNavigableUrl('/page', 'https://example.com')).toBe(true);
    expect(isNavigableUrl('/file.pdf', 'https://example.com')).toBe(false);
  });
});

describe('getBaseDomain', () => {
  it('should extract base domain from subdomain', () => {
    expect(getBaseDomain('https://sub.example.com')).toBe('example.com');
    expect(getBaseDomain('https://a.b.example.com')).toBe('example.com');
  });

  it('should return hostname for simple domains', () => {
    expect(getBaseDomain('https://example.com')).toBe('example.com');
    expect(getBaseDomain('https://localhost')).toBe('localhost');
  });
});

describe('toAbsoluteUrl', () => {
  it('should convert relative to absolute', () => {
    expect(toAbsoluteUrl('/page', 'https://example.com')).toBe('https://example.com/page');
    expect(toAbsoluteUrl('page', 'https://example.com/dir/')).toBe('https://example.com/dir/page');
  });

  it('should return absolute URLs unchanged', () => {
    expect(toAbsoluteUrl('https://example.com/page', 'https://other.com')).toBe(
      'https://example.com/page'
    );
  });
});

describe('redactSensitiveParams', () => {
  it('should redact sensitive parameters', () => {
    const url = 'https://example.com?token=secret123&name=john';
    const redacted = redactSensitiveParams(url);
    expect(redacted).toContain('token=%5BREDACTED%5D');
    expect(redacted).toContain('name=john');
  });

  it('should redact various sensitive patterns', () => {
    const url = 'https://example.com?api_key=abc&password=xyz&session_id=123';
    const redacted = redactSensitiveParams(url);
    expect(redacted).toContain('api_key=%5BREDACTED%5D');
    expect(redacted).toContain('password=%5BREDACTED%5D');
    expect(redacted).toContain('session_id=%5BREDACTED%5D');
  });
});
