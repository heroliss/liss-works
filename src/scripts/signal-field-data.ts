// Authored branches form the interactive band and its static SVG fallback.
// These are connected vertices, not an unrelated decorative particle cloud.
export const ANCHORS: readonly (readonly [number, number])[] = [
  [.035, .53], [.08, .31], [.13, .73], [.20, .44], [.24, .19], [.28, .64],
  [.34, .84], [.38, .32], [.41, .55], [.45, .12], [.50, .74], [.53, .38],
  [.58, .60], [.61, .23], [.65, .83], [.69, .47], [.73, .10], [.77, .67],
  [.81, .31], [.86, .88], [.91, .53], [.95, .12], [.14, .11], [.08, .89],
  [.34, .06], [.94, .23], [.86, .76], [.98, .47],
];
export const EDGES: readonly (readonly [number, number])[] = [
  [0, 1], [0, 2], [0, 3], [1, 3], [1, 4], [1, 22], [2, 5], [2, 23],
  [3, 5], [3, 7], [4, 7], [4, 22], [4, 24], [5, 6], [5, 8], [6, 10],
  [7, 8], [7, 9], [7, 11], [8, 10], [8, 12], [9, 13], [9, 24], [10, 12],
  [10, 14], [11, 12], [11, 13], [11, 15], [12, 15], [12, 17], [13, 16],
  [13, 18], [14, 17], [14, 19], [15, 18], [15, 20], [16, 21], [17, 26],
  [18, 25], [20, 27],
];
export const DESTINATIONS = [
  { node: 25, name: 'Outpost', color: '#ff9c82' },
  { node: 26, name: 'DubForge', color: '#7ee8ff' },
  { node: 27, name: 'SSFramework', color: '#dbf48b' },
] as const;

