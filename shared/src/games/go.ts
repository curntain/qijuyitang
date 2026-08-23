// 围棋:支持 9/13/19 路,提子、禁自尽、简单位打劫、双虚手后中国规则数子

import type { DuoPlayer, GameEngine, GameStatus, GoMove, Player, Point } from '../types.js';
import { otherPlayer } from '../types.js';

export const KOMI = 7.5;

export interface GoState {
  turn: DuoPlayer;
  moveCount: number;
  lastMove: GoMove | null;
  size: number;
  // 0=空 1=黑 2=白
  board: number[][];
  koPoint: Point | null;
  // 连续虚手次数,达到 2 即终局数子
  passes: number;
  captures: { black: number; white: number };
}

function stoneOf(p: Player): number {
  return p === 'black' ? 1 : 2;
}

function inBoard(size: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < size && y < size;
}

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** 返回 (x,y) 所在棋块的坐标集合与气数 */
function groupInfo(board: number[][], x: number, y: number): { points: Point[]; liberties: number } {
  const size = board.length;
  const color = board[y][x];
  const points: Point[] = [];
  const seen = new Set<string>();
  const libs = new Set<string>();
  const stack: Point[] = [{ x, y }];
  seen.add(`${x},${y}`);
  while (stack.length) {
    const p = stack.pop()!;
    points.push(p);
    for (const [dx, dy] of NEIGHBORS) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (!inBoard(size, nx, ny)) continue;
      const key = `${nx},${ny}`;
      if (board[ny][nx] === 0) libs.add(key);
      else if (board[ny][nx] === color && !seen.has(key)) {
        seen.add(key);
        stack.push({ x: nx, y: ny });
      }
    }
  }
  return { points, liberties: libs.size };
}

export const goEngine: GameEngine<GoState, GoMove> = {
  id: 'go',
  name: '围棋',

  initialState(options) {
    const rawSize = Number(options?.size ?? 9);
    const size = [9, 13, 19].includes(rawSize) ? rawSize : 9;
    return {
      turn: 'black',
      moveCount: 0,
      lastMove: null,
      size,
      board: Array.from({ length: size }, () => new Array<number>(size).fill(0)),
      koPoint: null,
      passes: 0,
      captures: { black: 0, white: 0 },
    };
  },

  isLegalMove(state, move) {
    if (state.passes >= 2) return false;
    if ('pass' in move) return true;
    const { x, y } = move;
    if (!inBoard(state.size, x, y) || state.board[y][x] !== 0) return false;
    if (state.koPoint && state.koPoint.x === x && state.koPoint.y === y) return false;
    // 模拟落子:不允许自尽
    const board = state.board.map((r) => r.slice());
    const me = stoneOf(state.turn);
    board[y][x] = me;
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      if (inBoard(state.size, nx, ny) && board[ny][nx] !== 0 && board[ny][nx] !== me) {
        const g = groupInfo(board, nx, ny);
        if (g.liberties === 0) {
          for (const p of g.points) board[p.y][p.x] = 0;
        }
      }
    }
    return groupInfo(board, x, y).liberties > 0;
  },

  applyMove(state, move) {
    if (!this.isLegalMove(state, move)) throw new Error('非法着法');
    if ('pass' in move) {
      return {
        ...state,
        turn: otherPlayer(state.turn),
        moveCount: state.moveCount + 1,
        lastMove: move,
        passes: state.passes + 1,
        koPoint: null,
      };
    }

    const board = state.board.map((r) => r.slice());
    const me = stoneOf(state.turn);
    const { x, y } = move;
    board[y][x] = me;

    // 提掉对方无气棋块
    let captured: Point[] = [];
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      if (inBoard(state.size, nx, ny) && board[ny][nx] !== 0 && board[ny][nx] !== me) {
        const g = groupInfo(board, nx, ny);
        if (g.liberties === 0) {
          captured = captured.concat(g.points);
          for (const p of g.points) board[p.y][p.x] = 0;
        }
      }
    }

    // 简单位打劫:恰好提一子且新落棋块为单子
    let koPoint: Point | null = null;
    const ownGroup = groupInfo(board, x, y);
    if (captured.length === 1 && ownGroup.points.length === 1 && ownGroup.liberties === 1) {
      koPoint = captured[0];
    }

    const captures = { ...state.captures };
    captures[state.turn] += captured.length;

    return {
      ...state,
      board,
      turn: otherPlayer(state.turn),
      moveCount: state.moveCount + 1,
      lastMove: move,
      passes: 0,
      koPoint,
      captures,
    };
  },

  getStatus(state): GameStatus {
    if (state.passes < 2) return 'playing';
    const { black, white } = scoreArea(state);
    if (black > white) return 'black-win';
    return 'white-win'; // 贴 7.5 目不存在和棋
  },

  getLegalMoves(state) {
    const moves: GoMove[] = [];
    if (state.passes >= 2) return moves;
    moves.push({ pass: true });
    for (let y = 0; y < state.size; y++) {
      for (let x = 0; x < state.size; x++) {
        if (state.board[y][x] === 0 && this.isLegalMove(state, { x, y })) {
          moves.push({ x, y });
        }
      }
    }
    return moves;
  },
};

/** 中国规则数子:盘面子数 + 单色围住的空点,白加贴目 */
export function scoreArea(state: GoState): { black: number; white: number } {
  const size = state.size;
  const visited = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  let black = 0;
  let white = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (state.board[y][x] === 1) black++;
      else if (state.board[y][x] === 2) white++;
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (state.board[y][x] !== 0 || visited[y][x]) continue;
      // 洪水填充空区域,记录邻接颜色
      const region: Point[] = [];
      const stack: Point[] = [{ x, y }];
      visited[y][x] = true;
      let touchBlack = false;
      let touchWhite = false;
      while (stack.length) {
        const p = stack.pop()!;
        region.push(p);
        for (const [dx, dy] of NEIGHBORS) {
          const nx = p.x + dx;
          const ny = p.y + dy;
          if (!inBoard(size, nx, ny)) continue;
          const v = state.board[ny][nx];
          if (v === 0) {
            if (!visited[ny][nx]) {
              visited[ny][nx] = true;
              stack.push({ x: nx, y: ny });
            }
          } else if (v === 1) touchBlack = true;
          else touchWhite = true;
        }
      }
      if (touchBlack && !touchWhite) black += region.length;
      else if (touchWhite && !touchBlack) white += region.length;
    }
  }
  white += KOMI;
  return { black, white };
}
