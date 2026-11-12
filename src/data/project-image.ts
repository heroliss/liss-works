import type { GalleryImage } from './types';
import displayMedia from './display-media.json' with { type: 'json' };

const display = (displayMedia as { images: Record<string, { has1600?: boolean; display?: string }> }).images;

/** Responsive candidates: sized variants, then a lossy full-width display copy
 * when one exists; the lossless original stays the `src` / lightbox target. */
export function responsiveSrcset(src: string, width: number): string {
  const entry = display[src] ?? {};
  const sizes = [320, 640, 960, ...(entry.has1600 ? [1600] : [])].filter(size => size < width);
  return [...sizes.map(size => `${src.replace(/\.webp$/, `-${size}.webp`)} ${size}w`), `${entry.display ?? src} ${width}w`].join(', ');
}

/** All variants preserve the full frame and the source aspect ratio. */
export function projectImage(repo: string, filename: string, width: number, height: number, caption: string, kind: string): GalleryImage {
  const src = `/media/${repo.toLowerCase()}/${filename.replace(/\.[^.]+$/, '')}.webp`;
  return { src, srcset: responsiveSrcset(src, width), width, height, alt: caption, caption, kind };
}
