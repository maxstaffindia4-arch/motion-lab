/**
 * Verbatim on-screen-text enforcement ("Lock Text").
 *
 * The generated composition splits words into separate elements and may use
 * "/" or "|" as visual separators, so we compare normalised visible text
 * (tags stripped, whitespace and separator punctuation collapsed) rather than
 * a raw substring of the HTML. Matching stays case-sensitive: the words must
 * appear verbatim.
 */

export function htmlToVisibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function normalizeForLock(text: string): string {
  return text
    .replace(/[\/|•·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface LockTextCheck {
  ok: boolean;
  message: string;
  visibleText: string;
}

export function validateLockedText(html: string, lockedText: string): LockTextCheck {
  const visibleText = htmlToVisibleText(html);
  const target = normalizeForLock(lockedText);
  if (!target) {
    return { ok: true, message: '', visibleText };
  }

  const ok = normalizeForLock(visibleText).includes(target);
  return {
    ok,
    visibleText,
    message: ok
      ? ''
      : `Lock Text rejected: generated composition does not contain the locked on-screen text verbatim: "${lockedText}"`
  };
}

export class LockTextError extends Error {
  code = 'LOCK_TEXT_REJECTED';
  constructor(message: string) {
    super(message);
    this.name = 'LockTextError';
  }
}
