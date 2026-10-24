export interface StoryCode {
  language: string;
  source: string;
  caption?: string;
}
export interface ProjectStory {
  origin: { title: string; paragraphs: string[] };
  stack?: { name: string; role: string }[];
  flow?: { title: string; steps: { name: string; description: string }[] };
  sections?: {
    id: string;
    title: string;
    diagram?: 'framework-architecture';
    intro?: string;
    paragraphs?: string[];
    items?: { title: string; body: string[] }[];
    code?: StoryCode;
  }[];
  footnote?: string;
}

