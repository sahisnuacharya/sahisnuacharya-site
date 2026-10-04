import type { MediaRef } from './content';

export const IMAGE_FORMATS = ['avif', 'webp'] as const;

export function imageKey(id: string, width: number, format: string): string {
  return `img/${id}/${width}.${format}`;
}

export function imageUrl(id: string, width: number, format: string): string {
  return `/media/${imageKey(id, width, format)}`;
}

export function fileUrl(media: MediaRef): string {
  return `/media/file/${media.id}`;
}

export function srcset(media: MediaRef, format: string): string {
  return media.widths.map((w) => `${imageUrl(media.id, w, format)} ${w}w`).join(', ');
}

/** The best single URL for places that need one image, like social previews. */
export function fallbackImageUrl(media: MediaRef, target = 1200): string | null {
  const format = media.formats.includes('webp') ? 'webp' : media.formats[0];
  if (!format || media.widths.length === 0) return null;
  const sorted = [...media.widths].sort((a, b) => a - b);
  const width = sorted.find((w) => w >= target) ?? sorted[sorted.length - 1];
  return width ? imageUrl(media.id, width, format) : null;
}
