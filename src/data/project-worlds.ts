import { toolWorlds } from './project-worlds-tools';
import { labWorlds } from './project-worlds-labs';
export interface ProjectWorld { accent: string; surface: string; motion: string; family: string; }
export const projectWorlds: Record<string,ProjectWorld> = {
 'ssframework': { accent:'#dbf48b',surface:'#18231b',motion:'nodes',family:'architecture' },
 'dubforge': { accent:'#7ee8ff',surface:'#131e29',motion:'pipeline',family:'editing' },
 'outpost': { accent:'#ff9c82',surface:'#271a1b',motion:'orbit',family:'battlefield' },
 'nomadworkshop': { accent:'#65d7a0',surface:'#1b2821',motion:'map',family:'survival' },
 'gomoku': { accent:'#c6b6ff',surface:'#241e2e',motion:'tree',family:'strategy' },
 ...toolWorlds,...labWorlds,
};
export function getProjectWorld(slug:string): ProjectWorld {
 return projectWorlds[slug] ?? {accent:'#9cdef1',surface:'#151a1d',motion:'orbit',family:'studio'};
}
export function projectWorldStyle(slug:string) {
 const world=getProjectWorld(slug);
 return `--project-tone:${world.accent};--world-surface:${world.surface}`;
}
