/** Browser explanation port of heroliss/FloydShortestPath. No source matrix is mutated. */
export interface GraphNode { id: string; x: number; y: number }
export interface GraphEdge { from: string; to: string; weight: number }
export interface FloydResult { distances: number[][]; predecessors: number[][] }

export const graphNodes: GraphNode[] = [
  { id: 'A', x: 64, y: 180 }, { id: 'B', x: 210, y: 70 },
  { id: 'C', x: 210, y: 290 }, { id: 'D', x: 390, y: 70 },
  { id: 'E', x: 390, y: 290 }, { id: 'F', x: 536, y: 180 },
];

const baseEdges: GraphEdge[] = [
  { from: 'A', to: 'B', weight: 4 }, { from: 'A', to: 'C', weight: 2 },
  { from: 'B', to: 'C', weight: 1 }, { from: 'B', to: 'D', weight: 5 },
  { from: 'C', to: 'D', weight: 8 }, { from: 'C', to: 'E', weight: 10 },
  { from: 'D', to: 'E', weight: 2 }, { from: 'D', to: 'F', weight: 6 },
  { from: 'E', to: 'F', weight: 3 },
];

export type GraphPreset = 'network' | 'shortcut' | 'disconnected';
export function presetEdges(preset: GraphPreset): GraphEdge[] {
  if (preset === 'shortcut') return baseEdges.map((edge) => ({ ...edge, weight: edge.from === 'C' && edge.to === 'E' ? 2 : edge.weight }));
  if (preset === 'disconnected') return baseEdges.filter((edge) => edge.to !== 'F').map((edge) => ({ ...edge }));
  return baseEdges.map((edge) => ({ ...edge }));
}

export function adjacencyMatrix(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): number[][] {
  const ids = nodes.map((node) => node.id);
  if (new Set(ids).size !== ids.length) throw new Error('节点名称不能重复。');
  const matrix = nodes.map((_, i) => nodes.map((__, j) => i === j ? 0 : Infinity));
  for (const edge of edges) {
    const from = ids.indexOf(edge.from), to = ids.indexOf(edge.to);
    if (from < 0 || to < 0) throw new Error('边引用了不存在的节点。');
    if (!Number.isFinite(edge.weight) || edge.weight < 0) throw new Error('本实验的边权必须为非负有限数。');
    if (from === to) throw new Error('本实验不使用自环。');
    matrix[from][to] = Math.min(matrix[from][to], edge.weight);
    matrix[to][from] = Math.min(matrix[to][from], edge.weight);
  }
  return matrix;
}

export function computeFloyd(graph: readonly (readonly number[])[]): FloydResult {
  const count = graph.length;
  if (graph.some((row) => row.length !== count)) throw new Error('邻接矩阵必须为方阵。');
  graph.forEach((row, i) => row.forEach((weight, j) => {
    if (Number.isNaN(weight) || weight === -Infinity) throw new Error('权重必须是有限数或正无穷。');
    if (i === j && weight !== 0) throw new Error('对角线必须为零。');
  }));
  const distances = graph.map((row) => [...row]);
  const predecessors = graph.map((row, i) => row.map((weight) => weight === Infinity ? -1 : i));
  for (let k = 0; k < count; k++) for (let i = 0; i < count; i++) for (let j = 0; j < count; j++) {
    const candidate = distances[i][k] + distances[k][j];
    if (candidate < distances[i][j]) {
      distances[i][j] = candidate;
      predecessors[i][j] = predecessors[k][j];
    }
  }
  if (distances.some((row, i) => row[i] < 0)) throw new Error('图中存在负环。');
  return { distances, predecessors };
}

export function reconstructPath(predecessors: readonly (readonly number[])[], start: number, end: number): number[] {
  const count = predecessors.length;
  if (predecessors.some((row) => row.length !== count)) throw new Error('前驱矩阵必须为方阵。');
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < 0 || start >= count || end >= count) throw new Error('节点超出范围。');
  if (predecessors[start][end] === -1) return [];
  const path = [end];
  while (end !== start) {
    end = predecessors[start][end];
    if (!Number.isInteger(end) || end < 0 || end >= count || path.length >= count) throw new Error('无法从前驱矩阵还原路径。');
    path.push(end);
  }
  return path.reverse();
}

export function routeEdges(path: readonly number[], nodes: readonly GraphNode[]): Set<string> {
  const result = new Set<string>();
  for (let i = 1; i < path.length; i++) result.add([nodes[path[i - 1]].id, nodes[path[i]].id].sort().join('-'));
  return result;
}
