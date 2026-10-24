import type { GalleryImage, Project } from './types';

// Place each image beside its topic or in the gallery, without repeating it.
const topicMedia: Record<string, (string | null)[]> = {
  nomadworkshop: ['05-resident-and-world-1080'],
  outpost: ['23-modern-battle-settings'],
  dubforge: ['07-assembly-versions', '08-production-settings', '06-project-overview'],
  ssframework: [null, null, null, '15-hierarchy-binding-compact', '05-module-tools-center'],
  eazybuildpipeline: ['04-reverse-dependencies-three-assets'],
  'intelligence-index-cost-linear': ['08-provider-highlight-dark-live'],
  'china-house-price-map': ['06-dark-shenzhen-detail-after-fix'],
  learnopengl: ['cube-inspector'],
  'aoe4-autovillager-tool': ['editor-search-safe-preview'],
  'ga-sort': ['05-final-equation-convergence'],
  floydshortestpath: ['regression-checks-report'],
  'liss-web': ['02-markdown-writing-dark-1280', '05-welcome-dark-1280'],
  gomoku: ['06-independent-black-settings-1280', '11-live-network-v32-1280'],
  'route-lab': ['02-random-compare-1440'],
  'sort-lab': ['06-core-algorithm-editor'],
};

export interface StoryMedia { image?: GalleryImage; inset?: GalleryImage; }

export function getStoryMedia(project: Project): StoryMedia[] {
  const resolve = (name: string | null): GalleryImage | undefined => {
    if (!name) return undefined;
    const image = project.gallery.find(image => image.src.endsWith(`/${name}.webp`));
    if (!image || image.src === project.cover.src) throw new Error(`Invalid topic image: ${project.slug}/${name}`);
    return image;
  };
  return (topicMedia[project.slug] ?? []).map((name, index) => ({
    image: resolve(name),
    inset: project.slug === 'ssframework' && index === 3 ? resolve('13-node-component-popup') : undefined,
  }));
}
