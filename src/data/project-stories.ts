import ssframework from './stories/ssframework';
import dubforge from './stories/dubforge';
import panxu from './stories/panxu';
import glassAtoll from './stories/glass-atoll';
import chinaHousePriceMap from './stories/china-house-price-map';
import intelligenceIndexCostLinear from './stories/intelligence-index-cost-linear';
import { otherStories } from './stories/other-projects';
import { restoredStories } from './stories/restored-projects';
import { webStories } from './stories/web-projects';
import type { ProjectStory } from './story-types';

const stories: Record<string, ProjectStory> = { ...otherStories, ...restoredStories, ...webStories, ssframework, dubforge, panxu, 'glass-atoll': glassAtoll, 'china-house-price-map': chinaHousePriceMap, 'intelligence-index-cost-linear': intelligenceIndexCostLinear };

export function getProjectStory(slug: string): ProjectStory {
  const story = stories[slug];
  if (!story) throw new Error(`Missing project story: ${slug}`);
  return story;
}
