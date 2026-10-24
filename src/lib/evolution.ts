/** Small, deterministic permutation GA for the web explanation of GA-sort. */
export interface EvolutionState { population: number[][]; generation: number; best: number[]; bestScore: number; randomState: number }
const size = 8;
export const perfectScore = size * (size - 1) / 2;
export function permutationScore(values: readonly number[]): number {
  let score = 0;
  for (let i = 0; i < values.length; i++) for (let j = i + 1; j < values.length; j++) if (values[i] < values[j]) score++;
  return score;
}
function random(state: { randomState: number }): number {
  let value = state.randomState >>> 0;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  state.randomState = value >>> 0;
  return state.randomState / 4294967296;
}
function shuffle(values: number[], state: { randomState: number }): number[] {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}
function rank(population: number[][]): number[][] { return population.sort((a, b) => permutationScore(b) - permutationScore(a)); }
export function createEvolution(seed = 42): EvolutionState {
  const source = { randomState: (seed >>> 0) || 42 };
  const population = rank(Array.from({ length: 48 }, () => shuffle(Array.from({ length: size }, (_, i) => i + 1), source)));
  return { population, generation: 0, best: [...population[0]], bestScore: permutationScore(population[0]), randomState: source.randomState };
}
export function stepEvolution(current: EvolutionState): EvolutionState {
  if (current.bestScore === perfectScore) return current;
  const source = { randomState: current.randomState };
  const tournament = (): number[] => {
    const candidates = Array.from({ length: 3 }, () => current.population[Math.floor(random(source) * current.population.length)]);
    return candidates.reduce((best, item) => permutationScore(item) > permutationScore(best) ? item : best);
  };
  const population: number[][] = current.population.slice(0, 2).map((item) => [...item]);
  while (population.length < current.population.length) {
    const parentA = tournament(), parentB = tournament();
    const start = Math.floor(random(source) * size), end = start + 1 + Math.floor(random(source) * (size - start));
    const segment = parentA.slice(start, end);
    const remaining = parentB.filter((value) => !segment.includes(value));
    const child = [...remaining.slice(0, start), ...segment, ...remaining.slice(start)];
    if (random(source) < .35) {
      const a = Math.floor(random(source) * size), b = Math.floor(random(source) * size);
      [child[a], child[b]] = [child[b], child[a]];
    }
    population.push(child);
  }
  rank(population);
  return { population, generation: current.generation + 1, best: [...population[0]], bestScore: permutationScore(population[0]), randomState: source.randomState };
}
