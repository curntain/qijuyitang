// 统一棋类框架:所有棋种实现同一个 GameEngine 接口,前后端共用

export type Player = 'black' | 'white' | 'red' | 'blue';
/** 仅黑白对弈的棋种(五子棋/围棋/象棋/国象)使用的窄类型 */
export type DuoPlayer = 'black' | 'white';
export type GameStatus =
  | 'playing'
  | 'black-win'
  | 'white-win'
  | 'red-win'
  | 'blue-win'
  | 'team-a-win' // 四国军棋四人模式:南方+北方联军胜
  | 'team-b-win' // 东方+西方联军胜
  | 'draw';
export type GameId = 'gomoku' | 'go' | 'xiangqi' | 'chess' | 'junqi';

export interface Point {
  x: number;
  y: number;
}

// 各棋种着法类型
export type GomokuMove = Point;
export type GoMove = Point | { pass: true };
export type XiangqiMove = { from: Point; to: Point };
export type ChessMove = { from: string; to: string; promotion?: string };
export type JunqiMove = { from: Point; to: Point };

export type Move = GomokuMove | GoMove | XiangqiMove | ChessMove | JunqiMove;

// 每种棋自己的棋盘状态(JSON 可序列化,便于 WebSocket 传输)
export interface BaseState {
  turn: Player;
  moveCount: number;
  lastMove: Move | null;
}

export interface GameEngine<S extends BaseState = BaseState, M extends Move = Move> {
  id: GameId;
  name: string;
  initialState(options?: Record<string, unknown>): S;
  /** 应用着法并返回新状态;非法着法抛出 Error */
  applyMove(state: S, move: M): S;
  isLegalMove(state: S, move: M): boolean;
  getStatus(state: S): GameStatus;
  /** 当前行棋方所有合法着法,供 AI 与提示使用 */
  getLegalMoves(state: S): M[];
}

export function otherPlayer(p: Player): DuoPlayer {
  return p === 'black' ? 'white' : 'black';
}

export function statusWinner(s: GameStatus): Player | null {
  if (s === 'black-win') return 'black';
  if (s === 'white-win') return 'white';
  if (s === 'red-win') return 'red';
  if (s === 'blue-win') return 'blue';
  return null;
}

/** 终局状态对应的获胜方集合(四人组队模式返回两个颜色) */
export function statusWinners(s: GameStatus): Player[] {
  switch (s) {
    case 'black-win':
      return ['black'];
    case 'white-win':
      return ['white'];
    case 'red-win':
      return ['red'];
    case 'blue-win':
      return ['blue'];
    case 'team-a-win':
      return ['black', 'white'];
    case 'team-b-win':
      return ['red', 'blue'];
    default:
      return [];
  }
}
