import { toolWorlds } from './project-worlds-tools';
import { labWorlds } from './project-worlds-labs';
export interface ProjectWorld { accent: string; surface: string; motion: string; family: string; }
export const projectWorlds: Record<string,ProjectWorld> = {
 'glass-atoll': { accent:'#7bdcd1',surface:'#0f1f1d',motion:'light',family:'island' },
 'ssframework': { accent:'#dbf48b',surface:'#1a1d12',motion:'nodes',family:'architecture' },
 'dubforge': { accent:'#32bcf7',surface:'#111e24',motion:'pipeline',family:'editing' },
 'panxu': { accent:'#7f8cff',surface:'#14162a',motion:'bars',family:'disk' },
 'outpost': { accent:'#ff9c82',surface:'#251815',motion:'orbit',family:'battlefield' },
 'nomadworkshop': { accent:'#8ed77f',surface:'#161e15',motion:'map',family:'survival' },
 'gomoku': { accent:'#ea99d1',surface:'#23181f',motion:'tree',family:'strategy' },
 ...toolWorlds,...labWorlds,
};
export function getProjectWorld(slug:string): ProjectWorld {
 return projectWorlds[slug] ?? {accent:'#9cdef1',surface:'#151a1d',motion:'orbit',family:'studio'};
}
export function projectWorldStyle(slug:string) {
 const world=getProjectWorld(slug);
 return `--project-tone:${world.accent};--world-surface:${world.surface}`;
}
