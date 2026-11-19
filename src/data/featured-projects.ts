import { getProject } from './projects.ts';
import type { Project } from './types.ts';

export interface FeaturedWorkMeta {
  slug: string;
  shortName: string;
  hook: string;
  highlight: string;
  homeAnchor?: string;
}

export interface HomeFeaturedWorkMeta extends FeaturedWorkMeta {
  homeAnchor: string;
}

/**
 * The 7 flagship works featured in the Home Hero Hall and full Home Chapters.
 */
export const homeFeaturedWorks: readonly HomeFeaturedWorkMeta[] = [
  {
    slug: 'glass-atoll',
    shortName: '玻璃海',
    homeAnchor: '#atoll',
    hook: '浏览器里就能逛的热带小岛',
    highlight: '实时 WebGL 浅海、天光昼夜与夜空烟花',
  },
  {
    slug: 'dubforge',
    shortName: 'DubForge',
    homeAnchor: '#workflow',
    hook: '把外语好视频做成中文配音与双语版',
    highlight: '九道工序译制 + 本地 AI 双封面同发',
  },
  {
    slug: 'ssframework',
    shortName: 'SSFramework',
    homeAnchor: '#selected',
    hook: 'Unity 游戏和工具的底层框架',
    highlight: '清晰分层架构、运行时诊断与节点生成',
  },
  {
    slug: 'panxu',
    shortName: '盘序',
    homeAnchor: '#panxu',
    hook: '让 AI 帮你判断文件能不能删',
    highlight: '63 项规则 + AI 复核，绿色免安装可回退',
  },
  {
    slug: 'china-house-price-map',
    shortName: '全国房价舆图',
    homeAnchor: '#atlas',
    hook: '按上班地点与预算画通勤圈找好房',
    highlight: '全国 372 城买房租房双视角与小区体检',
  },
  {
    slug: 'intelligence-index-cost-linear',
    shortName: 'Intelligence × Cost',
    homeAnchor: '#cost-chart',
    hook: '按真实用途挑 AI，一眼算清月卡回本',
    highlight: '等比例线性美元横轴 · 400+ 模型与多模态比价',
  },
  {
    slug: 'gomoku',
    shortName: 'Liss Gomoku',
    homeAnchor: '#games',
    hook: '11 种 AI 引擎、联机与逐手复盘的五子棋',
    highlight: '黑白独立搜索配置、实时统计与 Photon 联机',
  },
] as const;

/**
 * Additional library-level featured works (displayed in the Engineering Library's
 * Featured Showcase, Featured filter, card badges and detail tags, without adding
 * extra slots to the Home Hero Hall).
 */
const libraryExtraFeaturedWorks: readonly FeaturedWorkMeta[] = [
  {
    slug: 'aoe4-flow',
    shortName: 'AoE4 Flow',
    hook: '用节点图把图像识别与键鼠操作串成自动化流程',
    highlight: '执行流与数据流分离 · 实时预览、耗时监控与断点调试',
  },
  {
    slug: 'liss-web',
    shortName: 'Liss Community',
    hook: '独立搭建的 Markdown 写作交流社区与后台',
    highlight: '访客免注册发文、账号平滑升级与站点运营管理',
  },
] as const;

/**
 * All 9 site-wide featured projects for the Engineering Library, filters and badges.
 */
export const featuredWorks: readonly FeaturedWorkMeta[] = [
  ...homeFeaturedWorks,
  ...libraryExtraFeaturedWorks,
] as const;

export const featuredSlugs = new Set<string>(featuredWorks.map(item => item.slug));
export const homeFeaturedSlugs = new Set<string>(homeFeaturedWorks.map(item => item.slug));

export function isFeaturedProject(slug: string): boolean {
  return featuredSlugs.has(slug);
}

export function getHomeFeaturedProjects(): Array<HomeFeaturedWorkMeta & { project: Project }> {
  return homeFeaturedWorks.map(item => {
    const project = getProject(item.slug);
    if (!project) throw new Error(`Home featured project not found: ${item.slug}`);
    return { ...item, project };
  });
}

export function getFeaturedProjects(): Array<FeaturedWorkMeta & { project: Project }> {
  return featuredWorks.map(item => {
    const project = getProject(item.slug);
    if (!project) throw new Error(`Featured project not found: ${item.slug}`);
    return { ...item, project };
  });
}
