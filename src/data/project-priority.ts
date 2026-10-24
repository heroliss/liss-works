import type { Project } from './types';

// Shared editorial order for the home page and project library. Unknown projects
// retain their source order, so adding a project never silently drops it.
export const projectPriority = [
  'ssframework', 'dubforge', 'nomadworkshop', 'outpost', 'gomoku',
  'aoe4-flow', 'eazybuildpipeline', 'liss-web',
  'intelligence-index-cost-linear', 'learnopengl', 'china-house-price-map',
  'sort-lab', 'route-lab', 'qt-labs', 'systems-lab', 'text-lab', 'nex',
  'utility-lab', 'mkfun', 'liss-blocks', 'floydshortestpath', 'ga-sort',
] as const;

export function prioritizeProjects(items: readonly Project[]): Project[] {
  const rank = new Map<string, number>(projectPriority.map((slug, index) => [slug, index]));
  return items.map((project, index) => ({ project, index }))
    .sort((a, b) => (rank.get(a.project.slug) ?? projectPriority.length)
      - (rank.get(b.project.slug) ?? projectPriority.length) || a.index - b.index)
    .map(({ project }) => project);
}
