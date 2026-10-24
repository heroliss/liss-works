export type ProjectGroup = 'games' | 'ai-data' | 'graphics';

export interface GalleryImage {
  src: string;
  srcset?: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  kind: string;
}

export interface Project {
  slug: string;
  repo: string;
  name: string;
  category: string;
  group: ProjectGroup;
  summary: string;
  intro: string;
  status: string;
  tags: string[];
  features: { title: string; body: string }[];
  usage: { title: string; body: string; code?: string; language?: string }[];
  note?: string;
  source: string;
  demo?: string;
  download?: { repository: string; assetPattern: string };
  docs?: string;
  cover: GalleryImage;
  gallery: GalleryImage[];
  related: string[];
  video?: { src: string; poster: string; caption: string };
}
