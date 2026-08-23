// 国际象棋 AI:基于 chess.js 的子力评估 + 深度 2 极小极大

import { Chess } from 'chess.js';
import type { ChessMove, ChessState } from '@qi/shared';

const VALUES: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

/** 以 w 方视角评估子力差 */
function evalMaterial(c: Chess): number {
  let score = 0;
  for (const square of c.board().flat()) {
    if (!square) continue;
    const v = VALUES[square.type] ?? 0;
    score += square.color === 'w' ? v : -v;
  }
  return score;
}

export function computeChessMove(state: ChessState): ChessMove | null {
  const root = new Chess(state.fen);
  const myColor = root.turn(); // 'w' | 'b'
  const sign = myColor === 'w' ? 1 : -1;
  const moves = root.moves({ verbose: true });
  if (moves.length === 0) return null;

  let bestMove = moves[0];
  let bestScore = -Infinity;

  for (const m of moves) {
    const c1 = new Chess(state.fen);
    c1.move({ from: m.from, to: m.to, promotion: m.promotion ?? 'q' });
    if (c1.isCheckmate()) {
      return { from: m.from, to: m.to, promotion: m.promotion };
    }
    // 对方最优回应后的局面评估(深度 2)
    let worst = Infinity;
    const replies = c1.moves({ verbose: true });
    if (replies.length === 0) {
      worst = c1.isDraw() || c1.isStalemate() ? 0 : evalMaterial(c1) * sign;
    } else {
      for (const r of replies) {
        const c2 = new Chess(c1.fen());
        c2.move({ from: r.from, to: r.to, promotion: r.promotion ?? 'q' });
        let v: number;
        if (c2.isCheckmate()) v = -100000; // 我方被将死
        else if (c2.isDraw() || c2.isStalemate()) v = 0;
        else v = evalMaterial(c2) * sign;
        if (v < worst) worst = v;
      }
    }
    if (worst > bestScore) {
      bestScore = worst;
      bestMove = m;
    }
  }
  return { from: bestMove.from, to: bestMove.to, promotion: bestMove.promotion };
}
