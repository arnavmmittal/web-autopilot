/**
 * URL normalization and parsing utilities
 */

export interface ParsedUrl {
  protocol: string;
  host: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  origin: string;
}

/**
 * Normalize a URL by:
 * - Converting to lowercase hostname
 * - Removing fragments (#)
 * - Removing trailing slashes (except for root)
 * - Sorting query parameters
 * - Removing default ports
 */
export function normalizeUrl(urlString: string, baseUrl?: string): string {
  try {
    const url = baseUrl ? new URL(urlString, baseUrl) : new URL(urlString);

    // Normalize hostname to lowercase
    url.hostname = url.hostname.toLowerCase();

    // Remove fragment
    url.hash = '';

    // Remove default ports
    if (
      (url.protocol === 'http:' && url.port === '80') ||
      (url.protocol === 'https:' && url.port === '443')
    ) {
      url.port = '';
    }

    // Sort query parameters for consistent comparison
    if (url.search) {
      const params = new URLSearchParams(url.search);
      const sortedParams = new URLSearchParams([...params.entries()].sort());
      url.search = sortedParams.toString();
    }

    let normalized = url.toString();

    // Remove trailing slash (except for root path)
    if (normalized.endsWith('/') && url.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  } catch {
    // Return original if parsing fails
    return urlString;
  }
}

/**
 * Check if two URLs are the same after normalization
 */
export function isSameUrl(url1: string, url2: string, baseUrl?: string): boolean {
  return normalizeUrl(url1, baseUrl) === normalizeUrl(url2, baseUrl);
}

/**
 * Check if a URL is on the same host as the base URL
 */
export function isSameHost(urlString: string, baseUrl: string): boolean {
  try {
    const url = new URL(urlString, baseUrl);
    const base = new URL(baseUrl);
    return url.hostname.toLowerCase() === base.hostname.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Check if a URL is internal (same host) or external
 */
export function isInternalUrl(urlString: string, baseUrl: string): boolean {
  try {
    const url = new URL(urlString, baseUrl);
    const base = new URL(baseUrl);

    // Must be same host
    if (url.hostname.toLowerCase() !== base.hostname.toLowerCase()) {
      return false;
    }

    // Must be http or https
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a URL is valid and navigable
 */
export function isNavigableUrl(urlString: string, baseUrl?: string): boolean {
  try {
    const url = baseUrl ? new URL(urlString, baseUrl) : new URL(urlString);

    // Must be http or https
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    // Exclude common non-page extensions
    const excludedExtensions = [
      '.pdf',
      '.zip',
      '.tar',
      '.gz',
      '.rar',
      '.7z',
      '.exe',
      '.dmg',
      '.pkg',
      '.deb',
      '.rpm',
      '.mp3',
      '.mp4',
      '.wav',
      '.avi',
      '.mov',
      '.mkv',
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.svg',
      '.webp',
      '.ico',
      '.doc',
      '.docx',
      '.xls',
      '.xlsx',
      '.ppt',
      '.pptx',
    ];

    const pathname = url.pathname.toLowerCase();
    if (excludedExtensions.some((ext) => pathname.endsWith(ext))) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Extract the base domain from a URL (e.g., example.com from sub.example.com)
 */
export function getBaseDomain(urlString: string): string {
  try {
    const url = new URL(urlString);
    const parts = url.hostname.split('.');

    // Handle localhost and IP addresses
    if (parts.length <= 2 || /^\d+$/.test(parts[parts.length - 1])) {
      return url.hostname;
    }

    // Return last two parts (domain.tld)
    return parts.slice(-2).join('.');
  } catch {
    return urlString;
  }
}

/**
 * Convert a relative URL to absolute
 */
export function toAbsoluteUrl(urlString: string, baseUrl: string): string {
  try {
    return new URL(urlString, baseUrl).toString();
  } catch {
    return urlString;
  }
}

/**
 * Get the path portion of a URL
 */
export function getPath(urlString: string): string {
  try {
    return new URL(urlString).pathname;
  } catch {
    return urlString;
  }
}

/**
 * Redact sensitive query parameters (tokens, keys, passwords)
 */
export function redactSensitiveParams(urlString: string): string {
  try {
    const url = new URL(urlString);
    const sensitivePatterns = [
      /token/i,
      /key/i,
      /password/i,
      /secret/i,
      /auth/i,
      /session/i,
      /api[_-]?key/i,
      /access[_-]?token/i,
      /refresh[_-]?token/i,
    ];

    const params = new URLSearchParams(url.search);
    const redacted = new URLSearchParams();

    for (const [key, value] of params.entries()) {
      if (sensitivePatterns.some((pattern) => pattern.test(key))) {
        redacted.set(key, '[REDACTED]');
      } else {
        redacted.set(key, value);
      }
    }

    url.search = redacted.toString();
    return url.toString();
  } catch {
    return urlString;
  }
}
