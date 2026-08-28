// 国际象棋:基于 chess.js 封装为统一 GameEngine 接口

import { Chess } from 'chess.js';
import type { ChessMove, GameEngine, GameStatus } from '../types.js';

export interface ChessState {
  turn: 'black' | 'white';
  moveCount: number;
  lastMove: ChessMove | null;
  fen: string;
  inCheck: boolean; // 当前行棋方是否被将军
}

export const chessEngine: GameEngine<ChessState, ChessMove> = {
  id: 'chess',
  name: '国际象棋',

  initialState(options?: Record<string, unknown>): ChessState {
    const fen = new Chess().fen();
    const whiteFirst = options?.firstTurn === 'white';
    return {
      // 默认 black=先行方(chess.js 白先);随机先手时 white 先行,改走子方
      turn: whiteFirst ? 'white' : 'black',
      moveCount: 0,
      lastMove: null,
      fen: whiteFirst ? fen.replace(' w ', ' b ') : fen,
      inCheck: false,
    };
  },

  isLegalMove(state, move) {
    try {
      const c = new Chess(state.fen);
      c.move({ from: move.from, to: move.to, promotion: (move.promotion as any) ?? 'q' });
      return true;
    } catch {
      return false;
    }
  },

  applyMove(state, move) {
    const c = new Chess(state.fen);
    let made;
    try {
      made = c.move({ from: move.from, to: move.to, promotion: (move.promotion as any) ?? 'q' });
    } catch {
      throw new Error('非法着法');
    }
    return {
      turn: c.turn() === 'w' ? 'black' : 'white',
      moveCount: state.moveCount + 1,
      lastMove: { from: made.from, to: made.to, promotion: made.promotion },
      fen: c.fen(),
      inCheck: c.inCheck(),
    };
  },

  getStatus(state): GameStatus {
    const c = new Chess(state.fen);
    if (c.isCheckmate()) return c.turn() === 'w' ? 'white-win' : 'black-win';
    if (c.isDraw() || c.isStalemate()) return 'draw';
    return 'playing';
  },

  getLegalMoves(state) {
    const c = new Chess(state.fen);
    return c.moves({ verbose: true }).map((m) => ({
      from: m.from,
      to: m.to,
      promotion: m.promotion,
    }));
  },
};
