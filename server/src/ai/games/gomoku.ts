// 五子棋 AI:棋型启发式打分(进攻 + 防守),毫秒级

import type { GomokuMove, GomokuState } from '@qi/shared';

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;

/** 假设在 (x,y) 落 color 子后,该点的棋型分数 */
function pointValue(board: number[][], size: number, x: number, y: number, color: number): number {
  let total = 0;
  for (const [dx, dy] of DIRS) {
    let count = 1;
    let openEnds = 0;
    for (const sign of [1, -1]) {
      let nx = x + dx * sign;
      let ny = y + dy * sign;
      while (nx >= 0 && ny >= 0 && nx < size && ny < size && board[ny][nx] === color) {
        count++;
        nx += dx * sign;
        ny += dy * sign;
      }
      if (nx >= 0 && ny >= 0 && nx < size && ny < size && board[ny][nx] === 0) {
        openEnds++;
      }
    }
    if (count >= 5) total += 1e7;
    else if (count === 4) total += openEnds === 2 ? 1e6 : openEnds === 1 ? 1e5 : 0;
    else if (count === 3) total += openEnds === 2 ? 5e4 : openEnds === 1 ? 1e3 : 0;
    else if (count === 2) total += openEnds === 2 ? 500 : openEnds === 1 ? 50 : 0;
    else total += openEnds === 2 ? 20 : openEnds === 1 ? 5 : 0;
  }
  return total;
}

export function computeGomokuMove(state: GomokuState): GomokuMove | null {
  const { board, size } = state;
  const me = state.turn === 'black' ? 1 : 2;
  const opp = me === 1 ? 2 : 1;

  // 只考虑已有棋子周围的空点(首手走天元)
  const candidates = new Set<string>();
  let hasStone = false;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] === 0) continue;
      hasStone = true;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < size && ny < size && board[ny][nx] === 0) {
            candidates.add(`${nx},${ny}`);
          }
        }
      }
    }
  }
  if (!hasStone) return { x: Math.floor(size / 2), y: Math.floor(size / 2) };

  let best: GomokuMove | null = null;
  let bestScore = -1;
  for (const key of candidates) {
    const [x, y] = key.split(',').map(Number);
    const attack = pointValue(board, size, x, y, me);
    const defend = pointValue(board, size, x, y, opp);
    const score = attack + defend * 0.9;
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  return best;
}
