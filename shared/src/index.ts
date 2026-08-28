export * from './types.js';
export { gomokuEngine } from './games/gomoku.js';
export type { GomokuState } from './games/gomoku.js';
export { goEngine, scoreArea, KOMI } from './games/go.js';
export type { GoState } from './games/go.js';
export { xiangqiEngine, isInCheck, FILES, RANKS } from './games/xiangqi.js';
export type { XiangqiState, Piece, PieceType } from './games/xiangqi.js';
export { chessEngine } from './games/chess.js';
export type { ChessState } from './games/chess.js';
export {
  junqiEngine,
  eliminateSide,
  validateLayout,
  applyLayout,
  PIECE_DEFS,
  PIECE_NAMES,
  JUNQI_N,
  CAMP_SET,
  HQ_SET,
  FRONT_SET,
  CROSS_SET,
  RAIL_SET,
  CELL_SET,
  ZONE_CELL_SET,
  ROAD_EDGES,
  RAIL_EDGES,
  LINK_EDGES,
} from './games/junqi.js';
export type { JunqiState, JunqiPiece, JunqiColor } from './games/junqi.js';

import type { GameEngine, GameId } from './types.js';
import { gomokuEngine } from './games/gomoku.js';
import { goEngine } from './games/go.js';
import { xiangqiEngine } from './games/xiangqi.js';
import { chessEngine } from './games/chess.js';
import { junqiEngine } from './games/junqi.js';

export const engines: Record<GameId, GameEngine<any, any>> = {
  gomoku: gomokuEngine,
  go: goEngine,
  xiangqi: xiangqiEngine,
  chess: chessEngine,
  junqi: junqiEngine,
};

export const GAME_IDS: GameId[] = ['gomoku', 'go', 'xiangqi', 'chess', 'junqi'];
