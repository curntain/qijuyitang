// 围棋 AI:候选点蒙特卡洛随机模拟(低强度,时间预算内尽量多算)

import { goEngine, scoreArea } from '@qi/shared';
import type { GoMove, GoState, Player } from '@qi/shared';

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** 轻量模拟器:只保留提子逻辑,不做打劫判定(随机模拟可接受) */
class GoSim {
  constructor(
    public board: number[][],
    public size: number,
  ) {}

  private group(x: number, y: number): { points: number[][]; libs: number } {
    const color = this.board[y][x];
    const seen = new Set<number>();
    const points: number[][] = [];
    const libs = new Set<number>();
    const stack = [[x, y]];
    seen.add(y * this.size + x);
    while (stack.length) {
      const [px, py] = stack.pop()!;
      points.push([px, py]);
      for (const [dx, dy] of NEIGHBORS) {
        const nx = px + dx;
        const ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= this.size || ny >= this.size) continue;
        const key = ny * this.size + nx;
        if (this.board[ny][nx] === 0) libs.add(key);
        else if (this.board[ny][nx] === color && !seen.has(key)) {
          seen.add(key);
          stack.push([nx, ny]);
        }
      }
    }
    return { points, libs: libs.size };
  }

  /** 尝试落子;自尽返回 false */
  play(x: number, y: number, color: number): boolean {
    if (this.board[y][x] !== 0) return false;
    this.board[y][x] = color;
    const opp = color === 1 ? 2 : 1;
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= this.size || ny >= this.size) continue;
      if (this.board[ny][nx] === opp) {
        const g = this.group(nx, ny);
        if (g.libs === 0) for (const [gx, gy] of g.points) this.board[gy][gx] = 0;
      }
    }
    if (this.group(x, y).libs === 0) {
      this.board[y][x] = 0;
      return false;
    }
    return true;
  }

  /** 区域法计分(无贴目,由调用方处理) */
  areaScore(): { black: number; white: number } {
    const visited: boolean[][] = Array.from({ length: this.size }, () =>
      new Array<boolean>(this.size).fill(false),
    );
    let black = 0;
    let white = 0;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const v = this.board[y][x];
        if (v === 1) black++;
        else if (v === 2) white++;
      }
    }
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.board[y][x] !== 0 || visited[y][x]) continue;
        const stack = [[x, y]];
        visited[y][x] = true;
        let tb = false;
        let tw = false;
        let count = 0;
        while (stack.length) {
          const [px, py] = stack.pop()!;
          count++;
          for (const [dx, dy] of NEIGHBORS) {
            const nx = px + dx;
            const ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= this.size || ny >= this.size) continue;
            const v = this.board[ny][nx];
            if (v === 0) {
              if (!visited[ny][nx]) {
                visited[ny][nx] = true;
                stack.push([nx, ny]);
              }
            } else if (v === 1) tb = true;
            else tw = true;
          }
        }
        if (tb && !tw) black += count;
        else if (tw && !tb) white += count;
      }
    }
    return { black, white };
  }
}

/** 随机模拟一局,返回 aiColor 是否获胜 */
function simulate(board: number[][], size: number, nextColor: number, aiColor: number): boolean {
  const sim = new GoSim(
    board.map((r) => r.slice()),
    size,
  );
  const empties: number[][] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (sim.board[y][x] === 0) empties.push([x, y]);

  let color = nextColor;
  let passes = 0;
  const maxMoves = size * size * 2;
  for (let i = 0; i < maxMoves && passes < 2; i++) {
    // 小概率虚手,让对局能自然收敛
    if (Math.random() < 0.04 || empties.length === 0) {
      passes++;
      color = color === 1 ? 2 : 1;
      continue;
    }
    passes = 0;
    // 随机挑空点尝试,最多试 8 次(跳过自尽/已占点)
    let played = false;
    for (let t = 0; t < 8; t++) {
      const idx = Math.floor(Math.random() * empties.length);
      const [x, y] = empties[idx];
      if (sim.board[y][x] !== 0) {
        empties.splice(idx, 1);
        continue;
      }
      if (sim.play(x, y, color)) {
        empties.splice(idx, 1);
        played = true;
        break;
      }
    }
    color = color === 1 ? 2 : 1;
    if (!played) passes++;
  }

  const { black, white } = sim.areaScore();
  const KOMI = 7.5;
  const aiIsBlack = aiColor === 1;
  const aiScore = aiIsBlack ? black : white + KOMI;
  const oppScore = aiIsBlack ? white + KOMI : black;
  return aiScore > oppScore;
}

export function computeGoMove(state: GoState, deadline: number): GoMove | null {
  const aiColor = state.turn === 'black' ? 1 : 2;
  const legal = goEngine.getLegalMoves(state).filter((m): m is { x: number; y: number } => !('pass' in m));
  if (legal.length === 0) return { pass: true };

  // 空盘首手:天元附近
  if (state.moveCount === 0) {
    const c = Math.floor(state.size / 2);
    return { x: c, y: c };
  }

  // 候选点:优先已有棋子附近
  const near: typeof legal = [];
  for (const m of legal) {
    let hasNeighbor = false;
    for (let dy = -2; dy <= 2 && !hasNeighbor; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = m.x + dx;
        const ny = m.y + dy;
        if (nx >= 0 && ny >= 0 && nx < state.size && ny < state.size && state.board[ny][nx] !== 0) {
          hasNeighbor = true;
          break;
        }
      }
    }
    if (hasNeighbor) near.push(m);
  }
  const pool = (near.length > 0 ? near : legal).slice(0, 24);

  const SIMS_PER_CANDIDATE = 10;
  let best: GoMove | null = null;
  let bestRate = -1;
  for (const candidate of pool) {
    if (Date.now() > deadline) break;
    const after = goEngine.applyMove(state, candidate);
    let wins = 0;
    for (let i = 0; i < SIMS_PER_CANDIDATE; i++) {
      if (simulate(after.board, after.size, aiColor === 1 ? 2 : 1, aiColor)) wins++;
    }
    const rate = wins / SIMS_PER_CANDIDATE;
    if (rate > bestRate) {
      bestRate = rate;
      best = candidate;
    }
  }
  // 时间不足一个候选都没算完时,退化为随机合法着法
  if (!best) best = pool[Math.floor(Math.random() * pool.length)] ?? { pass: true };
  // 明显输光(胜率 0)时考虑虚手认负,避免无意义填子
  if (bestRate === 0 && state.moveCount > state.size * state.size) return { pass: true };
  return best;
}

export type { Player };
