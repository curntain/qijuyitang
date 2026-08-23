// 五子棋:15 路棋盘,先连成五子者胜

import type { GameEngine, GameStatus, GomokuMove, Point } from '../types.js';
import { otherPlayer } from '../types.js';

export const GOMOKU_SIZE = 15;

export interface GomokuState {
  turn: 'black' | 'white';
  moveCount: number;
  lastMove: GomokuMove | null;
  size: number;
  // 0=空 1=黑 2=白
  board: number[][];
  winner: 0 | 1 | 2;
}

const DIRS: Point[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
];

function checkWin(board: number[][], x: number, y: number, stone: number): boolean {
  for (const d of DIRS) {
    let count = 1;
    for (const sign of [1, -1]) {
      let nx = x + d.x * sign;
      let ny = y + d.y * sign;
      while (nx >= 0 && ny >= 0 && nx < board.length && ny < board.length && board[ny][nx] === stone) {
        count++;
        nx += d.x * sign;
        ny += d.y * sign;
      }
    }
    if (count >= 5) return true;
  }
  return false;
}

export const gomokuEngine: GameEngine<GomokuState, GomokuMove> = {
  id: 'gomoku',
  name: '五子棋',

  initialState(): GomokuState {
    return {
      turn: 'black',
      moveCount: 0,
      lastMove: null,
      size: GOMOKU_SIZE,
      board: Array.from({ length: GOMOKU_SIZE }, () => new Array<number>(GOMOKU_SIZE).fill(0)),
      winner: 0,
    };
  },

  isLegalMove(state, move): boolean {
    if (state.winner !== 0) return false;
    const { x, y } = move;
    return (
      Number.isInteger(x) && Number.isInteger(y) &&
      x >= 0 && y >= 0 && x < state.size && y < state.size &&
      state.board[y][x] === 0
    );
  },

  applyMove(state, move) {
    if (!this.isLegalMove(state, move)) throw new Error('非法着法');
    const board = state.board.map((row) => row.slice());
    const stone = state.turn === 'black' ? 1 : 2;
    board[move.y][move.x] = stone;
    const winner = checkWin(board, move.x, move.y, stone) ? stone : 0;
    return {
      ...state,
      board,
      winner: winner as 0 | 1 | 2,
      turn: otherPlayer(state.turn),
      moveCount: state.moveCount + 1,
      lastMove: move,
    };
  },

  getStatus(state): GameStatus {
    if (state.winner === 1) return 'black-win';
    if (state.winner === 2) return 'white-win';
    if (state.moveCount >= state.size * state.size) return 'draw';
    return 'playing';
  },

  getLegalMoves(state) {
    const moves: GomokuMove[] = [];
    if (state.winner !== 0) return moves;
    for (let y = 0; y < state.size; y++) {
      for (let x = 0; x < state.size; x++) {
        if (state.board[y][x] === 0) moves.push({ x, y });
      }
    }
    return moves;
  },
};
