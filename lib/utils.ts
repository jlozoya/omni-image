export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function basenameWithoutExtension(name: string): string {
  const lastDot = name.lastIndexOf('.');
  return lastDot > 0 ? name.slice(0, lastDot) : name;
}

export function safeFilenamePart(value: string): string {
  return (
    value
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'image'
  );
}

export function timestampForFilename(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

export function ascii(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const RESTRICTED_URL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'chrome-error://',
  'chrome-search://',
  'chrome-untrusted://',
  'devtools://',
  'edge://',
  'about:',
  'moz-extension://',
  'view-source:',
];

const RESTRICTED_URL_ORIGINS = [
  'https://chrome.google.com/webstore',
  'https://chromewebstore.google.com',
  'https://microsoftedge.microsoft.com/addons',
  'https://addons.mozilla.org',
];

/** Whether `browser.scripting.executeScript` can inject into this tab's URL. */
export function isCapturableUrl(url: string | undefined): boolean {
  if (!url) return false;
  return (
    !RESTRICTED_URL_PREFIXES.some((prefix) => url.startsWith(prefix)) &&
    !RESTRICTED_URL_ORIGINS.some((origin) => url.startsWith(origin))
  );
}
