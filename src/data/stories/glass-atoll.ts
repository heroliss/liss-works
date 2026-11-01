import type { ProjectStory } from '../story-types';

const glassAtoll: ProjectStory = {
  origin: {
    title: '从一座岛出发',
    paragraphs: [
      '玻璃海从一个很简单的愿望开始：打开网页，就能在一座热带离岛旁停留一会儿。海、天、沙、植被与光线都在浏览器里实时生成。',
      '随着场景长大，镜头、昼夜、天气和烟花逐渐成为可探索的部分。每次移动视角，岛屿与海面的关系也会改变。',
    ],
  },
  stack: [
    { name: 'JavaScript / Three.js', role: '组织实时场景、相机、交互与渲染流程。' },
    { name: 'WebGL 2 / GLSL', role: '绘制海水、天空、植被与烟花等视觉层。' },
    { name: 'Web Audio', role: '把海浪和烟花等声音放进场景。' },
  ],
  sections: [
    {
      id: 'transparent-sea', title: '让浅海露出海底',
      items: [
        { title: '透明与反射同在', body: ['靠近岸边能透过水面看到海床，远望时天空和岛屿在波面留下反射；两种层次随着机位改变。'] },
        { title: '光在沙上移动', body: ['波纹、泡沫与水下焦散让海岸不是静止的一张贴图。'] },
      ],
    },
    {
      id: 'island-light', title: '让时间改变整座岛',
      items: [
        { title: '不只换一块天空', body: ['日光、云与夜色改变天空，也影响椰树、沙地与海面的明暗和颜色。'] },
        { title: '镜头决定风景', body: ['从近景到俯瞰，同一座岛会呈现不同尺度；视角和镜头设置可独立调整。'] },
      ],
    },
    {
      id: 'island-response', title: '给宁静一点回应',
      items: [
        { title: '近处的轻微扰动', body: ['向海里投石，或者放下一片漂浮的叶子，让水面和环境回应操作。'] },
        { title: '夜里的另一层光', body: ['烟花在天空绽放，也把色光投向岛屿与水面；发射和爆响保留空间感。'] },
      ],
    },
  ],
  footnote: '这是持续开发中的实时场景。画面与流畅度会随浏览器、显卡和显示分辨率变化；目前没有对所有设备作统一帧率承诺。',
};

export default glassAtoll;
