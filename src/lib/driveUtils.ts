/**
 * Normalizes Google Drive share links into direct-view image URLs.
 * Supports:
 * - https://drive.google.com/file/d/<ID>/view?usp=sharing
 * - https://drive.google.com/open?id=<ID>
 * - https://drive.google.com/uc?id=<ID>
 * - Direct image URLs (unchanged)
 */
export function normalizeImageUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.includes('drive.google.com')) {
      const fileMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
      if (fileMatch && fileMatch[1]) {
        return `https://drive.google.com/uc?export=view&id=${fileMatch[1]}`;
      }
      const idParam = parsed.searchParams.get('id');
      if (idParam) {
        return `https://drive.google.com/uc?export=view&id=${idParam}`;
      }
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

/**
 * Validates whether a URL resolves to a loadable image in the browser.
 */
export function validateImageLoads(url: string, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    if (!url) {
      resolve(false);
      return;
    }
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    let settled = false;

    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, timeoutMs);

    img.onload = () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        resolve(true);
      }
    };

    img.onerror = () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        resolve(false);
      }
    };

    img.src = url;
  });
}
