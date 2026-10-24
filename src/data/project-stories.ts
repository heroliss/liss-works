import ssframework from './stories/ssframework';
import dubforge from './stories/dubforge';
import { otherStories } from './stories/other-projects';
import type { ProjectStory } from './story-types';

const stories: Record<string, ProjectStory> = { ...otherStories, ssframework, dubforge };

export function getProjectStory(slug: string): ProjectStory {
  const story = stories[slug];
  if (!story) throw new Error(`Missing project story: ${slug}`);
  return story;
}
