import type { Project } from './types';
import { projectImage as image } from './project-image.ts';

const mkfun = [
  image('mkfun', '01-profile-mapping-1440.png', 1440, 900, '源样例、目标样例与新数据并列，输出档案及逐项来源规则。', '真实网页'),
  image('mkfun', '02-matrix-transpose-1440.png', 1440, 900, '用两份矩阵样例描述转置，转换结果与输入位置对应。', '结构重排'),
  image('mkfun', '04-key-value-mapping-1440.png', 1440, 900, '键值交换预设，展示字典键和字典值共同参与映射。', '键值映射'),
  image('mkfun', '03-roundtrip-validation-1440.png', 1440, 900, '目标丢失字段时往返检查失败，界面保留具体原因并阻止输出。', '验证与边界'),
];

const utilities = [
  image('utility-lab', '01-unicode-grid.jpg', 1581, 1000, 'Unicode 字符网格与详情同屏，查看箭头字符的码点、编码及转义。', '字符与编码'),
  image('utility-lab', '02-unicode-supplementary.jpg', 1581, 1000, '检索补充平面字符，对照 UTF-8 字节与 UTF-16 代理对。', '补充平面'),
  image('utility-lab', '03-rename-preview.jpg', 1581, 1204, '按规则预览汉字数字转换，原文件名、目标名称与处理状态逐项对应。', '文件名预览'),
  image('utility-lab', '05-rename-conflict.jpg', 1581, 1052, '同名冲突在执行前标记，可取消对应项后重新检查。', '冲突检查'),
];

export const webProjects: Project[] = [
  {
    slug: 'mkfun', repo: 'mkfun', name: 'mkfun · 结构映射实验台', category: 'Python 与数据结构实验', group: 'graphics',
    summary: '用两份嵌套样例描述规则，把新数据重组成另一种形状。',
    intro: '相同叶值连接输入与输出的位置，未匹配的值保留为常量；从档案重组、矩阵转置到键值交换，一份规则可以反复应用，也能查看每个结果来自哪里。',
    status: 'Python 工具与网页已发布', tags: ['Python', '原生 JavaScript', '数据结构', '规则映射'],
    features: [
      { title: '样例就是规则', body: '摆好源与目标结构，用相同叶值表达位置关系，不必逐字段编写转换。' },
      { title: '来源可以追踪', body: '每个目标位置显示输入路径或常量，结构不符与键碰撞都有明确提示。' },
      { title: '两种使用方式', body: 'Python 库与 CLI 服务代码调用，独立网页在浏览器中处理 JSON。' },
    ],
    usage: [
      { title: '从预设开始', body: '在线选择档案、转置或键值交换，修改新数据后执行；Ctrl+Enter 也可运行。' },
      { title: '检查是否保留信息', body: '开启往返检查，验证本次输入能否还原；目标丢字段时会给出失败原因。' },
      { title: '在 Python 中调用', body: '安装仓库发行版 wheel 后运行 CLI，也可使用 mkfun 库复用规则。', code: 'python -m mkfun --explain', language: 'bash' },
    ],
    note: 'Python 支持 list、tuple、dict、set 与内置标量；网页只处理 JSON 子集，整数受 JavaScript 精度限制，重复源值采用首个位置并提示。',
    source: 'https://github.com/heroliss/mkfun', docs: 'https://github.com/heroliss/mkfun#readme', demo: '/tools/mkfun/index.html',
    cover: mkfun[0], gallery: mkfun, related: ['utility-lab', 'ga-sort', 'sort-lab'],
  },
  {
    slug: 'utility-lab', repo: 'utility-lab', name: 'Liss Utilities · 字符与文件名工具', category: '浏览器实用工具集', group: 'ai-data',
    summary: '查清字符的编码，预览文件名的变化，日常小工具也可以清晰可控。',
    intro: 'Unicode 字符表与汉字数字重命名组成两个工作区：前者连接字形、码点与编码，后者先检查改名结果，再导出副本或按授权处理目录。',
    status: '浏览器中可直接体验', tags: ['JavaScript', 'Unicode 17', 'Web Worker', '本地文件 API'],
    features: [
      { title: '字符与编码一起看', body: '按字符、码点或英文名称检索，同时复制 UTF-8、UTF-16 与多种转义形式。' },
      { title: '命名变化先预览', body: '替换汉字数字或把数字提到前方，保留扩展名与目录名称，并标记冲突。' },
      { title: '文件留在本机', body: '无需上传，支持 ZIP 副本、目录授权执行、停止与已完成项的校验撤销。' },
    ],
    usage: [
      { title: '查一个字符', body: '输入字符、U+1F680、#128640 或英文名称，点击网格查看编码与复制选项。' },
      { title: '先看改名结果', body: '载入示例或选择文件，调整替换方式、段数、补位与前缀，逐项检查目标名称。' },
      { title: '选择输出方式', body: '优先下载改名副本 ZIP；桌面 Chrome / Edge 可选择目录并授权直接处理，完成后可保存操作记录。' },
    ],
    note: '直接目录模式采用复制、SHA-256 校验后删除原名，不是操作系统原子改名，也不能完整保留 ACL 等文件元数据；ZIP 副本模式保留原件。',
    source: 'https://github.com/heroliss/utility-lab', docs: 'https://github.com/heroliss/utility-lab#readme', demo: '/tools/utilities/index.html',
    cover: utilities[0], gallery: utilities, related: ['mkfun', 'text-lab', 'qt-labs'],
  },
];
