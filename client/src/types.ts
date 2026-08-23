// 前端公共类型与工具

import type { GameId, GameStatus, Player } from '@qi/shared';
import { statusWinners } from '@qi/shared';

export interface RoomPlayerView {
  name: string;
  color: Player;
  isAI: boolean;
  connected: boolean;
  userId: number | null;
  layoutReady?: boolean; // 四国军棋:是否已提交布阵
  myLayout?: { x: number; y: number; type: string }[] | null; // 本人已确认布阵(仅下发本人,供修改回显)
}

export interface ChatMessage {
  name: string;
  color: Player;
  text: string;
  at: number;
}

export interface RoomView {
  id: string;
  game: GameId;
  options: Record<string, unknown>;
  state: any;
  started: boolean;
  readyToStart: boolean;
  finished: boolean;
  status: GameStatus;
  resultReason: string;
  pendingUndo: { color: Player; name: string } | null;
  timeLeft: Partial<Record<Player, number>>;
  chatLog: ChatMessage[];
  players: RoomPlayerView[];
}

export interface LobbyRoom {
  id: string;
  game: GameId;
  started: boolean;
  readyToStart: boolean;
  finished: boolean;
  hasAI: boolean;
  players: string[];
  count: number;
  maxPlayers: number;
}

export const GAME_NAMES: Record<GameId, string> = {
  gomoku: '五子棋',
  go: '围棋',
  xiangqi: '中国象棋',
  chess: '国际象棋',
  junqi: '四国军棋',
};

export function colorName(game: GameId, color: Player): string {
  if (game === 'junqi') {
    return color === 'black' ? '南方' : color === 'white' ? '北方' : color === 'red' ? '东方' : '西方';
  }
  if (game === 'xiangqi') return color === 'black' ? '红方' : '黑方';
  if (game === 'chess') return color === 'black' ? '白棋' : '黑棋';
  return color === 'black' ? '黑方' : '白方';
}

export function resultText(room: RoomView, myColor: Player | null): string {
  if (!room.finished) return '';
  if (room.status === 'draw') return '和棋';
  const winners = statusWinners(room.status);
  const winnerNames = room.players
    .filter((p) => winners.includes(p.color))
    .map((p) => p.name)
    .join('、');
  const reason =
    room.resultReason === 'resign'
      ? '(认输)'
      : room.resultReason === 'timeout'
        ? '(断线超时)'
        : room.resultReason === 'clock'
          ? '(超时)'
          : room.resultReason === 'leave'
            ? '(中途离开)'
            : '';
  if (myColor && winners.includes(myColor)) return `你赢了 ${reason}`;
  if (myColor) return `你输了 ${reason} — ${winnerNames} 获胜`;
  return `${winnerNames} 获胜 ${reason}`;
}

/** 毫秒 → m:ss */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}
