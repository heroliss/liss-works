import type { GalleryImage } from './types';

/** All variants preserve the full frame and the source aspect ratio. */
export function projectImage(repo: string, filename: string, width: number, height: number, caption: string, kind: string): GalleryImage {
  const base = `/media/${repo.toLowerCase()}/${filename.replace(/\.[^.]+$/, '')}`;
  const variants = [320, 640, 960].filter(size => size < width);
  return {
    src: `${base}.webp`,
    srcset: [...variants.map(size => `${base}-${size}.webp ${size}w`), `${base}.webp ${width}w`].join(', '),
    width, height, alt: caption, caption, kind,
  };
}
