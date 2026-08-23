// 中国象棋 AI:子力价值评估 + Alpha-Beta 剪枝(深度 2,受时间预算约束)

import { xiangqiEngine } from '@qi/shared';
import type { Player, XiangqiMove, XiangqiState } from '@qi/shared';

const VALUES: Record<string, number> = {
  k: 10000,
  r: 900,
  c: 450,
  n: 400,
  b: 200,
  a: 200,
  p: 100,
};

/** 从 aiSide 视角评估局面子力 */
function evaluate(state: XiangqiState, aiSide: Player): number {
  let score = 0;
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = state.board[y][x];
      if (!p) continue;
      let v = VALUES[p.type];
      // 过河兵价值提升
      if (p.type === 'p') {
        const crossed = p.side === 'black' ? y <= 4 : y >= 5;
        if (crossed) v = 200;
      }
      score += p.side === aiSide ? v : -v;
    }
  }
  return score;
}

export function computeXiangqiMove(state: XiangqiState, deadline: number): XiangqiMove | null {
  const aiSide = state.turn;
  const moves = xiangqiEngine.getLegalMoves(state);
  if (moves.length === 0) return null;

  // 吃子着法优先搜索,提高剪枝效率
  moves.sort((a, b) => captureValue(state, b) - captureValue(state, a));

  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const s1 = xiangqiEngine.applyMove(state, m);
    const score = alphabeta(s1, aiSide, 1, -Infinity, Infinity, deadline);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
    if (Date.now() > deadline) break; // 超时返回当前最优
  }
  return best;
}

function captureValue(state: XiangqiState, m: XiangqiMove): number {
  const target = state.board[m.to.y][m.to.x];
  return target ? VALUES[target.type] : 0;
}

/** 始终以 aiSide 视角返回局面分;行棋方是 AI 取 max,否则取 min */
function alphabeta(
  state: XiangqiState,
  aiSide: Player,
  depth: number,
  alpha: number,
  beta: number,
  deadline: number,
): number {
  if (depth >= 2 || Date.now() > deadline) {
    return evaluate(state, aiSide);
  }

  const moves = xiangqiEngine.getLegalMoves(state);
  if (moves.length === 0) {
    // 行棋方被困毙/绝杀
    return state.turn === aiSide ? -100000 : 100000;
  }

  moves.sort((a, b) => captureValue(state, b) - captureValue(state, a));

  if (state.turn === aiSide) {
    let best = -Infinity;
    for (const m of moves) {
      const next = xiangqiEngine.applyMove(state, m);
      best = Math.max(best, alphabeta(next, aiSide, depth + 1, alpha, beta, deadline));
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }
  let worst = Infinity;
  for (const m of moves) {
    const next = xiangqiEngine.applyMove(state, m);
    worst = Math.min(worst, alphabeta(next, aiSide, depth + 1, alpha, beta, deadline));
    beta = Math.min(beta, worst);
    if (alpha >= beta) break;
  }
  return worst;
}
