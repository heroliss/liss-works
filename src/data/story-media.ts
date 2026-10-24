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
  'aoe4-flow': ['editor-node-parameters-native'],
  'ga-sort': ['05-final-equation-convergence'],
  floydshortestpath: ['regression-checks-report'],
  'liss-web': ['02-markdown-writing-dark-1280', '05-welcome-dark-1280', '18-admin-overview-1440'],
  gomoku: ['06-independent-black-settings-1280', '11-live-network-v32-1280'],
  'route-lab': ['02-random-compare-1440'],
  'sort-lab': ['11-core-code-editor'],
  nex: ['05-recommendation-breakdown'],
  mkfun: ['02-matrix-transpose-1440', '03-roundtrip-validation-1440'],
  'utility-lab': ['02-unicode-supplementary', '03-rename-preview'],
  'liss-blocks': ['02-four-line-clear-and-hold'],
  'text-lab': [null, '04-local-imported-word2vec', '03-mixed-encoding-search'],
  'systems-lab': [null, '02-device-resource-chain', '06-banker-granted-request', '04-prime-density-and-results'],
  'qt-labs': ['03-os-queues-and-events', '05-huffman-roundtrip', '10-calculator-expression'],
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
    inset: project.slug === 'ssframework' && index === 3 ? resolve('13-node-component-popup')
      : project.slug === 'aoe4-flow' && index === 0 ? resolve('topbar-native') : undefined,
  }));
}
