import { toolWorlds } from './project-worlds-tools';
import { labWorlds } from './project-worlds-labs';
export interface ProjectWorld { accent: string; surface: string; motion: string; family: string; }
export const projectWorlds: Record<string,ProjectWorld> = {
 'glass-atoll': { accent:'#6ee8e3',surface:'#001c1b',motion:'light',family:'island' },
 'ssframework': { accent:'#c8ec60',surface:'#141a07',motion:'nodes',family:'architecture' },
 'dubforge': { accent:'#30aff8',surface:'#061925',motion:'pipeline',family:'editing' },
 'panxu': { accent:'#778ffa',surface:'#121627',motion:'bars',family:'disk' },
 'outpost': { accent:'#fd8358',surface:'#25110b',motion:'orbit',family:'battlefield' },
 'nomadworkshop': { accent:'#6ce182',surface:'#0b1b0e',motion:'map',family:'survival' },
 'gomoku': { accent:'#fd9ac6',surface:'#231019',motion:'tree',family:'strategy' },
 ...toolWorlds,...labWorlds,
};
export function getProjectWorld(slug:string): ProjectWorld {
 return projectWorlds[slug] ?? {accent:'#9cdef1',surface:'#151a1d',motion:'orbit',family:'studio'};
}
export function projectWorldStyle(slug:string) {
 const world=getProjectWorld(slug);
 return `--project-tone:${world.accent};--world-surface:${world.surface}`;
}
