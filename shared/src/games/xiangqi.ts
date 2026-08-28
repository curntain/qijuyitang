// 中国象棋:全兵种走法、将帅照面、将军与绝杀(困毙亦负)
// 框架统一用 black/white 表示双方;象棋中 black=红方(先行),渲染层再映射为红黑样式

import type { GameEngine, GameStatus, Player, Point, XiangqiMove } from '../types.js';
import { otherPlayer } from '../types.js';

export const FILES = 9; // x: 0-8
export const RANKS = 10; // y: 0-9, white(黑方)在上, black(红方)在下

export type PieceType = 'k' | 'a' | 'b' | 'n' | 'r' | 'c' | 'p';

export interface Piece {
  type: PieceType;
  side: Player;
}

export interface XiangqiState {
  turn: Player;
  moveCount: number;
  lastMove: XiangqiMove | null;
  board: (Piece | null)[][]; // [y][x]
  inCheck: boolean; // 当前行棋方是否被将军
}

function inBoard(x: number, y: number): boolean {
  return x >= 0 && x < FILES && y >= 0 && y < RANKS;
}

// black(红方)区域 y 5-9, white(黑方)区域 y 0-4
function inOwnHalf(side: Player, y: number): boolean {
  return side === 'black' ? y >= 5 : y <= 4;
}

function inPalace(side: Player, x: number, y: number): boolean {
  if (x < 3 || x > 5) return false;
  return side === 'black' ? y >= 7 && y <= 9 : y >= 0 && y <= 2;
}

function buildInitialBoard(): (Piece | null)[][] {
  const board: (Piece | null)[][] = Array.from({ length: RANKS }, () =>
    new Array<Piece | null>(FILES).fill(null),
  );
  const back: PieceType[] = ['r', 'n', 'b', 'a', 'k', 'a', 'b', 'n', 'r'];
  for (let x = 0; x < FILES; x++) {
    board[0][x] = { type: back[x], side: 'white' };
    board[9][x] = { type: back[x], side: 'black' };
  }
  board[2][1] = { type: 'c', side: 'white' };
  board[2][7] = { type: 'c', side: 'white' };
  board[7][1] = { type: 'c', side: 'black' };
  board[7][7] = { type: 'c', side: 'black' };
  for (let x = 0; x < FILES; x += 2) {
    board[3][x] = { type: 'p', side: 'white' };
    board[6][x] = { type: 'p', side: 'black' };
  }
  return board;
}

function findKing(board: (Piece | null)[][], side: Player): Point | null {
  for (let y = 0; y < RANKS; y++) {
    for (let x = 0; x < FILES; x++) {
      const p = board[y][x];
      if (p && p.type === 'k' && p.side === side) return { x, y };
    }
  }
  return null;
}

/** 直线是否畅通(不含两端) */
function lineClear(board: (Piece | null)[][], from: Point, to: Point): boolean {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  let x = from.x + dx;
  let y = from.y + dy;
  while (x !== to.x || y !== to.y) {
    if (board[y][x]) return false;
    x += dx;
    y += dy;
  }
  return true;
}

/** 统计直线上(不含两端)的棋子数 */
function lineCount(board: (Piece | null)[][], from: Point, to: Point): number {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  let count = 0;
  let x = from.x + dx;
  let y = from.y + dy;
  while (x !== to.x || y !== to.y) {
    if (board[y][x]) count++;
    x += dx;
    y += dy;
  }
  return count;
}

const KNIGHT_OFFSETS = [
  { dx: 1, dy: 2, leg: { dx: 0, dy: 1 } },
  { dx: -1, dy: 2, leg: { dx: 0, dy: 1 } },
  { dx: 1, dy: -2, leg: { dx: 0, dy: -1 } },
  { dx: -1, dy: -2, leg: { dx: 0, dy: -1 } },
  { dx: 2, dy: 1, leg: { dx: 1, dy: 0 } },
  { dx: -2, dy: 1, leg: { dx: -1, dy: 0 } },
  { dx: 2, dy: -1, leg: { dx: 1, dy: 0 } },
  { dx: -2, dy: -1, leg: { dx: -1, dy: 0 } },
];

/** 某方棋子位于 from 时,能否攻击到 to 点(不考虑走子后己方安全) */
function attacks(board: (Piece | null)[][], from: Point, to: Point): boolean {
  const piece = board[from.y][from.x];
  if (!piece) return false;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  switch (piece.type) {
    case 'r':
      return (dx === 0 || dy === 0) && lineClear(board, from, to);
    case 'c':
      return (dx === 0 || dy === 0) && lineCount(board, from, to) === 1;
    case 'n': {
      const off = KNIGHT_OFFSETS.find((o) => o.dx === dx && o.dy === dy);
      if (!off) return false;
      return !board[from.y + off.leg.dy][from.x + off.leg.dx];
    }
    case 'p': {
      const forward = piece.side === 'black' ? -1 : 1;
      const crossed = !inOwnHalf(piece.side, from.y);
      if (dx === 0 && dy === forward) return true;
      if (crossed && dy === 0 && Math.abs(dx) === 1) return true;
      return false;
    }
    case 'k':
      // 将帅照面
      return dx === 0 && lineClear(board, from, to);
    default:
      return false; // 士象不能越区攻击对方九宫
  }
}

/** side 的将是否被将军(含将帅照面) */
export function isInCheck(board: (Piece | null)[][], side: Player): boolean {
  const king = findKing(board, side);
  if (!king) return true;
  const enemy = otherPlayer(side);
  for (let y = 0; y < RANKS; y++) {
    for (let x = 0; x < FILES; x++) {
      const p = board[y][x];
      if (p && p.side === enemy && attacks(board, { x, y }, king)) return true;
    }
  }
  return false;
}

/** 伪合法着法(不校验走子后己方是否被将) */
function pseudoMoves(board: (Piece | null)[][], from: Point): Point[] {
  const piece = board[from.y][from.x]!;
  const targets: Point[] = [];
  const push = (x: number, y: number) => {
    if (!inBoard(x, y)) return;
    const t = board[y][x];
    if (!t || t.side !== piece.side) targets.push({ x, y });
  };

  switch (piece.type) {
    case 'k':
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = from.x + dx;
        const ny = from.y + dy;
        if (inPalace(piece.side, nx, ny)) push(nx, ny);
      }
      break;
    case 'a':
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
        const nx = from.x + dx;
        const ny = from.y + dy;
        if (inPalace(piece.side, nx, ny)) push(nx, ny);
      }
      break;
    case 'b':
      for (const [dx, dy] of [[2, 2], [2, -2], [-2, 2], [-2, -2]] as const) {
        const nx = from.x + dx;
        const ny = from.y + dy;
        // 塞象眼 + 不能过河
        if (!inBoard(nx, ny) || !inOwnHalf(piece.side, ny)) continue;
        if (board[from.y + dy / 2][from.x + dx / 2]) continue;
        push(nx, ny);
      }
      break;
    case 'n':
      for (const off of KNIGHT_OFFSETS) {
        const nx = from.x + off.dx;
        const ny = from.y + off.dy;
        if (!inBoard(nx, ny)) continue;
        if (board[from.y + off.leg.dy][from.x + off.leg.dx]) continue; // 蹩马腿
        push(nx, ny);
      }
      break;
    case 'r':
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        let nx = from.x + dx;
        let ny = from.y + dy;
        while (inBoard(nx, ny)) {
          const t = board[ny][nx];
          if (!t) targets.push({ x: nx, y: ny });
          else {
            if (t.side !== piece.side) targets.push({ x: nx, y: ny });
            break;
          }
          nx += dx;
          ny += dy;
        }
      }
      break;
    case 'c':
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        let nx = from.x + dx;
        let ny = from.y + dy;
        let jumped = false;
        while (inBoard(nx, ny)) {
          const t = board[ny][nx];
          if (!jumped) {
            if (!t) targets.push({ x: nx, y: ny });
            else jumped = true;
          } else if (t) {
            if (t.side !== piece.side) targets.push({ x: nx, y: ny });
            break;
          }
          nx += dx;
          ny += dy;
        }
      }
      break;
    case 'p': {
      const forward = piece.side === 'black' ? -1 : 1;
      push(from.x, from.y + forward);
      if (!inOwnHalf(piece.side, from.y)) {
        push(from.x - 1, from.y);
        push(from.x + 1, from.y);
      }
      break;
    }
  }
  return targets;
}

function applyMoveToBoard(board: (Piece | null)[][], from: Point, to: Point): (Piece | null)[][] {
  const next = board.map((row) => row.slice());
  next[to.y][to.x] = next[from.y][from.x];
  next[from.y][from.x] = null;
  return next;
}

export const xiangqiEngine: GameEngine<XiangqiState, XiangqiMove> = {
  id: 'xiangqi',
  name: '中国象棋',

  initialState(options?: Record<string, unknown>): XiangqiState {
    return {
      turn: options?.firstTurn === 'white' ? 'white' : 'black', // 默认红先,支持随机先手
      moveCount: 0,
      lastMove: null,
      board: buildInitialBoard(),
      inCheck: false,
    };
  },

  isLegalMove(state, move) {
    const { from, to } = move;
    if (!inBoard(from.x, from.y) || !inBoard(to.x, to.y)) return false;
    if (from.x === to.x && from.y === to.y) return false;
    const piece = state.board[from.y][from.x];
    if (!piece || piece.side !== state.turn) return false;
    const targets = pseudoMoves(state.board, from);
    if (!targets.some((t) => t.x === to.x && t.y === to.y)) return false;
    // 走子后己方不能被将(含将帅照面)
    const next = applyMoveToBoard(state.board, from, to);
    return !isInCheck(next, state.turn);
  },

  applyMove(state, move) {
    if (!this.isLegalMove(state, move)) throw new Error('非法着法');
    const board = applyMoveToBoard(state.board, move.from, move.to);
    const nextTurn = otherPlayer(state.turn);
    return {
      turn: nextTurn,
      moveCount: state.moveCount + 1,
      lastMove: move,
      board,
      inCheck: isInCheck(board, nextTurn),
    };
  },

  getStatus(state): GameStatus {
    if (this.getLegalMoves(state).length === 0) {
      // 困毙/绝杀:轮到谁谁输
      return state.turn === 'black' ? 'white-win' : 'black-win';
    }
    return 'playing';
  },

  getLegalMoves(state) {
    const moves: XiangqiMove[] = [];
    for (let y = 0; y < RANKS; y++) {
      for (let x = 0; x < FILES; x++) {
        const p = state.board[y][x];
        if (!p || p.side !== state.turn) continue;
        const from = { x, y };
        for (const to of pseudoMoves(state.board, from)) {
          const next = applyMoveToBoard(state.board, from, to);
          if (!isInCheck(next, state.turn)) moves.push({ from, to });
        }
      }
    }
    return moves;
  },
};

export { isInCheck as xiangqiIsInCheck };
