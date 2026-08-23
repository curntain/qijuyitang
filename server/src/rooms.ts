// 房间与对局管理:大厅、创建/加入房间、落子校验、断线处理、战绩写入

import type { Server, Socket } from 'socket.io';
import type { GameId, GameStatus, JunqiState, Player } from '@qi/shared';
import { engines, eliminateSide, statusWinners, applyLayout, validateLayout } from '@qi/shared';
import { computeAIMove } from './ai/pool.js';
import { recordResult } from './db.js';

export interface RoomPlayer {
  userId: number | null; // AI 为 null
  name: string;
  color: Player;
  isAI: boolean;
  socketId: string | null;
}

export interface Room {
  id: string;
  game: GameId;
  options: Record<string, unknown>;
  players: RoomPlayer[];
  state: any;
  history: any[]; // 着法前状态历史栈,供悔棋回退
  started: boolean;
  readyToStart: boolean;
  finished: boolean;
  status: GameStatus;
  resultReason: string;
  createdAt: number;
  destroyed: boolean;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  aiPending: boolean;
  pendingUndo: { color: Player; name: string } | null; // 待对方确认的悔棋请求(真人对局)
  timeLimit: number; // 每方用时上限(毫秒),0=不限时
  timeLeft: Partial<Record<Player, number>>;
  clockTimer: ReturnType<typeof setInterval> | null;
  chatLog: { name: string; color: Player; text: string; at: number }[];
  layouts: Partial<Record<Player, { x: number; y: number; type: string }[]>>; // 四国军棋开局前各玩家布阵(保密,不下发他人)
}

const rooms = new Map<string, Room>();
const RECONNECT_GRACE = 60_000; // 断线保留 60 秒
const FINISHED_KEEP = 60_000; // 终局房间保留 60 秒供查看结果
const JUNQI_SEATS: Player[] = ['black', 'white', 'red', 'blue']; // 四国军棋加入顺序 → 南/北/东/西

function roomCapacity(game: GameId): number {
  return game === 'junqi' ? 4 : 2;
}

function randomRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id: string;
  do {
    id = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(id));
  return id;
}

function isConnected(io: Server, p: RoomPlayer): boolean {
  if (p.isAI) return true;
  if (!p.socketId) return false;
  return io.sockets.sockets.has(p.socketId);
}

export function roomView(io: Server, room: Room) {
  return {
    id: room.id,
    game: room.game,
    options: room.options,
    state: room.state,
    started: room.started,
    readyToStart: room.readyToStart,
    finished: room.finished,
    status: room.status,
    resultReason: room.resultReason,
    pendingUndo: room.pendingUndo,
    timeLeft: room.timeLeft,
    chatLog: room.chatLog,
    players: room.players.map((p) => ({
      name: p.name,
      color: p.color,
      isAI: p.isAI,
      connected: isConnected(io, p),
      userId: p.userId,
      layoutReady: Boolean(room.layouts[p.color]), // 四国军棋:是否已提交布阵
    })),
  };
}

/** 玩家个人视角:四国军棋隐藏非己方棋子身份(战争迷雾),其余棋种全量可见;
 *  布阵阶段仅下发本人已确认的布阵(供"修改布阵"回显),他人布阵保密 */
export function roomViewFor(io: Server, room: Room, viewer: Player | null) {
  const view = roomView(io, room);
  view.players = view.players.map((p) => ({
    ...p,
    myLayout: p.color === viewer ? room.layouts[p.color] ?? null : null,
  }));
  if (room.game !== 'junqi' || !viewer) return view;
  return {
    ...view,
    state: {
      ...view.state,
      board: (view.state as JunqiState).board.map((row) =>
        row.map((p) => (p && p.side !== viewer ? { side: '?', type: '?', rank: 0 } : p)),
      ),
    },
  };
}

/** 按玩家逐个广播各自视角的对局状态(迷雾隔离) */
function emitGameUpdate(io: Server, room: Room): void {
  for (const p of room.players) {
    if (!p.socketId) continue;
    io.to(p.socketId).emit('game:update', roomViewFor(io, room, p.color));
  }
}

function lobbyList(io: Server) {
  return Array.from(rooms.values())
    .filter((r) => !r.destroyed)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => ({
      id: r.id,
      game: r.game,
      started: r.started,
      readyToStart: r.readyToStart,
      finished: r.finished,
      hasAI: r.players.some((p) => p.isAI),
      players: r.players.map((p) => p.name),
      count: r.players.length,
      maxPlayers: roomCapacity(r.game),
    }));
}

export function broadcastLobby(io: Server): void {
  io.emit('lobby:update', lobbyList(io));
}

function destroyRoom(io: Server, room: Room): void {
  if (room.destroyed) return;
  room.destroyed = true;
  if (room.disconnectTimer) clearTimeout(room.disconnectTimer);
  if (room.clockTimer) clearInterval(room.clockTimer);
  rooms.delete(room.id);
  io.socketsLeave(`room:${room.id}`);
  broadcastLobby(io);
}

/** 终局:广播结果、写入战绩(仅真人对真人)、延迟销毁 */
function finishGame(io: Server, room: Room, status: GameStatus, reason: string): void {
  if (room.finished) return;
  room.finished = true;
  room.status = status;
  room.resultReason = reason;
  if (room.clockTimer) {
    clearInterval(room.clockTimer);
    room.clockTimer = null;
  }

  const humanVsHuman = room.players.every((p) => !p.isAI);
  if (humanVsHuman) {
    const winners = statusWinners(status);
    for (const p of room.players) {
      if (p.userId == null) continue;
      const result: 'win' | 'loss' | 'draw' =
        status === 'draw' ? 'draw' : winners.includes(p.color) ? 'win' : 'loss';
      recordResult(p.userId, room.game, result);
    }
  }

  emitGameUpdate(io, room);
  broadcastLobby(io);
  setTimeout(() => destroyRoom(io, room), FINISHED_KEEP);
}

/** 四国军棋:全员布阵完成即自动开赛 */
function tryStartJunqi(io: Server, room: Room): void {
  if (room.game !== 'junqi' || room.started || room.finished) return;
  if (room.players.length < 2 || !room.players.every((p) => room.layouts[p.color])) return;
  room.state = engines.junqi.initialState({ colors: room.players.map((p) => p.color) });
  for (const p of room.players) {
    applyLayout(room.state as JunqiState, p.color, room.layouts[p.color]!);
  }
  room.history = [];
  room.started = true;
  room.readyToStart = false;
  emitGameUpdate(io, room);
  broadcastLobby(io);
}

/** 四国军棋:淘汰一方(认输/超时/离场);若分出胜负则终局,否则继续对局 */
function eliminateJunqiSide(io: Server, room: Room, color: Player, reason: string): void {
  room.state = eliminateSide(room.state as JunqiState, color);
  const status: GameStatus = engines.junqi.getStatus(room.state);
  if (status !== 'playing') {
    finishGame(io, room, status, reason);
    return;
  }
  emitGameUpdate(io, room);
  broadcastLobby(io);
}

/** 每秒时钟心跳:扣减行棋方用时,超时判负(四国军棋为淘汰该方) */
function clockTick(io: Server, room: Room): void {
  if (room.destroyed || room.finished || !room.started || room.timeLimit <= 0) return;
  const turn = room.state.turn as Player;
  room.timeLeft[turn] = Math.max(0, (room.timeLeft[turn] ?? 0) - 1000);
  if ((room.timeLeft[turn] ?? 0) <= 0) {
    io.to(`room:${room.id}`).emit('game:time', room.timeLeft);
    if (room.game === 'junqi') {
      eliminateJunqiSide(io, room, turn, 'clock');
      return;
    }
    finishGame(io, room, turn === 'black' ? 'white-win' : 'black-win', 'clock');
    return;
  }
  io.to(`room:${room.id}`).emit('game:time', room.timeLeft);
}

function scheduleAIMove(io: Server, room: Room): void {
  if (room.finished || room.destroyed || room.aiPending) return;
  const ai = room.players.find((p) => p.isAI);
  if (!ai || room.state.turn !== ai.color) return;
  room.aiPending = true;

  computeAIMove(room.game, room.state).then((move) => {
    room.aiPending = false;
    if (room.finished || room.destroyed || room.state.turn !== ai.color) return;
    if (move == null) {
      // AI 无法出着:围棋虚手,其余判负
      if (room.game === 'go') {
        applyMove(io, room, ai.color, { pass: true } as any);
      } else {
        finishGame(io, room, ai.color === 'black' ? 'white-win' : 'black-win', 'resign');
      }
      return;
    }
    applyMove(io, room, ai.color, move as any);
  });
}

/** 服务端权威落子:校验 → 应用 → 广播 → 触发 AI/终局;返回是否成功 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyMove(io: Server, room: Room, color: Player, move: any): boolean {
  if (room.finished || room.state.turn !== color) return false;
  const engine = engines[room.game];
  if (!engine.isLegalMove(room.state, move)) return false;
  room.history.push(room.state); // 保存落子前状态,供悔棋回退
  if (room.history.length > 600) room.history.shift();
  room.state = engine.applyMove(room.state, move);
  room.started = true;
  room.pendingUndo = null; // 有新着法后,待确认的悔棋请求自动失效

  const status: GameStatus = engine.getStatus(room.state);
  if (status !== 'playing') {
    finishGame(io, room, status, 'normal');
    return true;
  }
  emitGameUpdate(io, room);
  scheduleAIMove(io, room);
  return true;
}

export function setupRooms(io: Server): void {
  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as { id: number; username: string } | null;

    socket.on('lobby:list', (ack?: (data: unknown) => void) => {
      ack?.({ ok: true, rooms: lobbyList(io) });
    });

    socket.on('room:create', (data: any, ack?: (data: unknown) => void) => {
      if (!user) return ack?.({ error: '请先登录' });
      const game = data?.game as GameId;
      if (!engines[game]) return ack?.({ error: '未知棋种' });
      // 同一用户不允许同时开多个房间(已结束的房间除外)
      for (const r of rooms.values()) {
        if (!r.finished && r.players.some((p) => p.userId === user.id)) {
          return ack?.({ error: '你已经在房间中了' });
        }
      }
      const vsAI = Boolean(data?.vsAI) && game !== 'junqi'; // 四国军棋仅支持真人对战
      const options = game === 'go' ? { size: [9, 13, 19].includes(Number(data?.size)) ? Number(data.size) : 9 } : {};
      const humanColor: Player = vsAI && data?.humanColor === 'white' ? 'white' : 'black';
      // 每方用时(分钟):仅支持 0(不限时)/5/10/30,其余视为不限时
      const timeMinutes = [5, 10, 30].includes(Number(data?.time)) ? Number(data.time) : 0;
      const timeLimit = timeMinutes * 60_000;

      const room: Room = {
        id: randomRoomId(),
        game,
        options: timeMinutes > 0 ? { ...options, time: timeMinutes } : options,
        players: [
          { userId: user.id, name: user.username, color: humanColor, isAI: false, socketId: socket.id },
        ],
        state: engines[game].initialState(game === 'junqi' ? { colors: [humanColor] } : options),
        history: [],
        started: false,
        readyToStart: false, // 两人到齐待开始(等房主点击开始)
        finished: false,
        status: 'playing',
        resultReason: '',
        createdAt: Date.now(),
        destroyed: false,
        disconnectTimer: null,
        aiPending: false,
        pendingUndo: null,
        timeLimit,
        timeLeft: { black: timeLimit, white: timeLimit, red: timeLimit, blue: timeLimit },
        clockTimer: null,
        chatLog: [],
        layouts: {},
      };

      if (vsAI) {
        room.players.push({ userId: null, name: 'AI 棋手', color: humanColor === 'black' ? 'white' : 'black', isAI: true, socketId: null });
        room.started = true;
      }

      rooms.set(room.id, room);
      if (timeLimit > 0) room.clockTimer = setInterval(() => clockTick(io, room), 1000);
      socket.join(`room:${room.id}`);
      socket.data.roomId = room.id;
      broadcastLobby(io);
      ack?.({ ok: true, room: roomViewFor(io, room, humanColor) });
      socket.emit('game:update', roomViewFor(io, room, humanColor));
      scheduleAIMove(io, room); // 人类执白时 AI 先手
    });

    socket.on('room:join', (data: any, ack?: (data: unknown) => void) => {
      if (!user) return ack?.({ error: '请先登录' });
      const room = rooms.get(String(data?.roomId ?? '').toUpperCase());
      if (!room || room.destroyed) return ack?.({ error: '房间不存在' });

      // 断线重连:本就是该房间玩家
      const existing = room.players.find((p) => p.userId === user.id);
      if (existing) {
        if (room.disconnectTimer) {
          clearTimeout(room.disconnectTimer);
          room.disconnectTimer = null;
        }
        existing.socketId = socket.id;
        socket.join(`room:${room.id}`);
        socket.data.roomId = room.id;
        ack?.({ ok: true, room: roomViewFor(io, room, existing.color) });
        socket.emit('game:update', roomViewFor(io, room, existing.color));
        return;
      }

      if (room.players.length >= roomCapacity(room.game)) return ack?.({ error: '房间已满' });
      if (room.started || room.finished) return ack?.({ error: '对局已开始' });
      if (room.readyToStart && roomCapacity(room.game) === 2) {
        return ack?.({ error: '房间已就绪,等待房主开始' });
      }

      const host = room.players[0];
      const color: Player =
        room.game === 'junqi' ? JUNQI_SEATS[room.players.length] : host.color === 'black' ? 'white' : 'black';
      room.players.push({
        userId: user.id,
        name: user.username,
        color,
        isAI: false,
        socketId: socket.id,
      });
      // 达到最低开赛人数(2 人)后进入就绪状态,等房主点击"开始对局";军棋可继续加入至 4 人,
      // 军棋的就绪 = 人数达标且全员已提交布阵(新玩家加入后需重新布阵确认)
      room.readyToStart =
        room.game === 'junqi'
          ? room.players.length >= 2 && room.players.every((p) => room.layouts[p.color])
          : room.players.length >= 2;
      socket.join(`room:${room.id}`);
      socket.data.roomId = room.id;
      emitGameUpdate(io, room);
      broadcastLobby(io);
      ack?.({ ok: true, room: roomViewFor(io, room, color) });
    });

    socket.on('game:layout', (data: any, ack?: (data: unknown) => void) => {
      const room = rooms.get(socket.data.roomId);
      if (!room || room.destroyed || room.finished) return ack?.({ error: '房间不存在' });
      if (room.game !== 'junqi') return ack?.({ error: '该棋种无需布阵' });
      if (room.started) return ack?.({ error: '对局已开始,无法修改布阵' });
      const me = room.players.find((p) => p.userId === user?.id);
      if (!me) return ack?.({ error: '你不在该房间' });
      const placements = data?.placements;
      const err = validateLayout(placements?.map?.((p: { type: string }) => p?.type));
      if (err) return ack?.({ error: err });
      for (const pl of placements) {
        if (!Number.isInteger(pl?.x) || !Number.isInteger(pl?.y) || typeof pl?.type !== 'string') {
          return ack?.({ error: '布阵格式错误' });
        }
      }
      // 先用引擎做逐子位置校验(在临时状态上),通过后才保存;布阵内容保密,不下发他人
      const probe = engines.junqi.initialState({ colors: [me.color] });
      const posErr = applyLayout(probe, me.color, placements);
      if (posErr) return ack?.({ error: posErr });
      room.layouts[me.color] = placements;
      room.readyToStart =
        room.players.length >= 2 && room.players.every((p) => room.layouts[p.color]);
      emitGameUpdate(io, room);
      broadcastLobby(io);
      tryStartJunqi(io, room);
      ack?.({ ok: true });
    });

    socket.on('game:start', (_data: any, ack?: (data: unknown) => void) => {
      const room = rooms.get(socket.data.roomId);
      if (!room || room.destroyed || room.finished) return ack?.({ error: '房间不存在' });
      const me = room.players.find((p) => p.userId === user?.id);
      if (!me) return ack?.({ error: '你不在该房间' });
      if (me !== room.players[0]) return ack?.({ error: '只有房主可以开始对局' });
      if (room.started) return ack?.({ error: '对局已开始' });
      if (!room.readyToStart || room.players.length < 2) return ack?.({ error: '人数不足,无法开赛' });
      if (room.game === 'junqi') {
        // 军棋全员布阵完成后自动开赛,无需手动开始;有人未布阵则提示等待
        tryStartJunqi(io, room);
        if (!room.started) return ack?.({ error: '还有玩家未完成布阵' });
        return ack?.({ ok: true });
      }
      room.started = true;
      room.readyToStart = false;
      emitGameUpdate(io, room);
      broadcastLobby(io);
      ack?.({ ok: true });
    });

    socket.on('game:move', (data: any, ack?: (data: unknown) => void) => {
      const room = rooms.get(socket.data.roomId);
      if (!room || room.destroyed || room.finished) return ack?.({ error: '对局已结束' });
      if (!room.started) return ack?.({ error: '对局尚未开始' });
      const me = room.players.find((p) => p.userId === user?.id);
      if (!me) return ack?.({ error: '你不在该房间' });
      if (room.state.turn !== me.color) return ack?.({ error: '还没轮到你落子' });
      const ok = applyMove(io, room, me.color, data?.move);
      ack?.(ok ? { ok: true } : { error: '非法着法' });
    });

    socket.on('game:undo', (_data: any, ack?: (data: unknown) => void) => {
      const room = rooms.get(socket.data.roomId);
      if (!room || room.destroyed || room.finished) return ack?.({ error: '对局已结束' });
      const me = room.players.find((p) => p.userId === user?.id);
      if (!me) return ack?.({ error: '你不在该房间' });
      if (room.game === 'junqi') return ack?.({ error: '四国军棋不支持悔棋' });
      const hasAI = room.players.some((p) => p.isAI);

      if (hasAI) {
        // 人机对局:无需确认,直接悔掉一整回合(我的上一手 + AI 的上一手)
        if (room.aiPending) return ack?.({ error: 'AI 正在思考,请稍候' });
        if (room.state.turn !== me.color) return ack?.({ error: '轮到你时才能悔棋' });
        if (room.history.length < 2) return ack?.({ error: '没有可悔的着法' });
        room.state = room.history.pop();
        room.state = room.history.pop();
        emitGameUpdate(io, room);
        return ack?.({ ok: true });
      }

      // 真人对局:只能悔自己刚下的上一手(当前轮到对方),需对方同意
      if (!room.started) return ack?.({ error: '对局尚未开始' });
      if (room.state.turn === me.color) return ack?.({ error: '只能在你落子后请求悔棋' });
      if (room.history.length < 1) return ack?.({ error: '没有可悔的着法' });
      if (room.pendingUndo) return ack?.({ error: '已有悔棋请求等待确认' });
      room.pendingUndo = { color: me.color, name: me.name };
      io.to(`room:${room.id}`).emit('game:undo-request', { name: me.name, color: me.color });
      emitGameUpdate(io, room);
      ack?.({ ok: true });
    });

    socket.on('game:undo:reply', (data: any, ack?: (data: unknown) => void) => {
      const room = rooms.get(socket.data.roomId);
      if (!room || room.destroyed || room.finished || !room.pendingUndo) return ack?.({ ok: false });
      const me = room.players.find((p) => p.userId === user?.id);
      if (!me || room.pendingUndo.color === me.color) return ack?.({ ok: false });
      const requester = room.pendingUndo;
      room.pendingUndo = null;
      if (data?.accept && room.history.length > 0) {
        room.state = room.history.pop(); // 对方同意:撤回上一手
        io.to(`room:${room.id}`).emit('game:undo-result', { accepted: true, name: requester.name });
      } else {
        io.to(`room:${room.id}`).emit('game:undo-result', { accepted: false, name: requester.name });
      }
      emitGameUpdate(io, room);
      ack?.({ ok: true });
    });

    socket.on('game:resign', (_data: any, ack?: (data: unknown) => void) => {
      const room = rooms.get(socket.data.roomId);
      if (!room || room.destroyed || room.finished) return ack?.({ error: '对局已结束' });
      const me = room.players.find((p) => p.userId === user?.id);
      if (!me) return ack?.({ error: '你不在该房间' });
      if (room.game === 'junqi') {
        // 多人对局:认输只淘汰自己,对局可能继续
        eliminateJunqiSide(io, room, me.color, 'resign');
      } else {
        finishGame(io, room, me.color === 'black' ? 'white-win' : 'black-win', 'resign');
      }
      ack?.({ ok: true });
    });

    socket.on('room:leave', (_data: any, ack?: (data: unknown) => void) => {
      const room = rooms.get(socket.data.roomId);
      socket.data.roomId = undefined;
      if (!room || room.destroyed) return ack?.({ ok: true });
      const idx = room.players.findIndex((p) => p.userId === user?.id);
      if (idx === -1) return ack?.({ ok: true });
      socket.leave(`room:${room.id}`);

      if (!room.started || room.finished) {
        if (idx > 0 && !room.finished) {
          // 就绪阶段客人主动离开:移除该玩家(含布阵);不足开赛人数则回退等待,否则重算就绪
          const leaver = room.players[idx];
          delete room.layouts[leaver.color];
          room.players.splice(idx, 1);
          room.readyToStart =
            room.game === 'junqi'
              ? room.players.length >= 2 && room.players.every((p) => room.layouts[p.color])
              : room.players.length >= 2;
          emitGameUpdate(io, room);
          broadcastLobby(io);
        } else {
          // 等待中的房间:房主离开即解散(终局房间同样清理)
          destroyRoom(io, room);
        }
        return ack?.({ ok: true });
      }
      // 对局中离开判负(四国军棋:淘汰该方,其余人继续)
      const me = room.players[idx];
      if (room.game === 'junqi') {
        eliminateJunqiSide(io, room, me.color, 'leave');
        room.players.splice(idx, 1);
        broadcastLobby(io);
        return ack?.({ ok: true });
      }
      room.players.splice(idx, 1);
      finishGame(io, room, me.color === 'black' ? 'white-win' : 'black-win', 'leave');
      ack?.({ ok: true });
    });

    socket.on('chat:send', (data: any, ack?: (data: unknown) => void) => {
      const room = rooms.get(socket.data.roomId);
      if (!room || room.destroyed) return ack?.({ ok: false });
      const me = room.players.find((p) => p.userId === user?.id);
      if (!me) return ack?.({ error: '你不在该房间' });
      const text = String(data?.text ?? '').trim().slice(0, 200);
      if (!text) return ack?.({ ok: false });
      const msg = { name: me.name, color: me.color, text, at: Date.now() };
      room.chatLog.push(msg);
      if (room.chatLog.length > 50) room.chatLog.shift();
      io.to(`room:${room.id}`).emit('chat:message', msg);
      ack?.({ ok: true });
    });

    socket.on('disconnect', () => {
      const room = rooms.get(socket.data.roomId);
      if (!room || room.destroyed) return;
      const me = room.players.find((p) => p.socketId === socket.id);
      if (!me) return;
      me.socketId = null;
      emitGameUpdate(io, room);

      if (room.finished) return;
      if (!room.started) {
        // 就绪阶段客人掉线:移除该玩家;军棋布阵阶段掉线同样移除(重进需重新布阵)
        const isGuest = me !== room.players[0];
        const shouldRemove = room.game === 'junqi' ? isGuest : room.readyToStart && isGuest;
        if (shouldRemove) {
          delete room.layouts[me.color];
          room.players.splice(room.players.indexOf(me), 1);
          room.readyToStart =
            room.game === 'junqi'
              ? room.players.length >= 2 && room.players.every((p) => room.layouts[p.color])
              : room.players.length >= 2;
          emitGameUpdate(io, room);
          broadcastLobby(io);
        }
        // 等待中的房间 5 分钟无人则解散
        room.disconnectTimer = setTimeout(() => {
          if (!room.players.some((p) => isConnected(io, p))) destroyRoom(io, room);
        }, 5 * 60_000);
        return;
      }
      const opponent = room.players.find((p) => p !== me);
      if (opponent?.isAI) {
        // 人机对局:断线 60 秒后解散
        room.disconnectTimer = setTimeout(() => destroyRoom(io, room), RECONNECT_GRACE);
        return;
      }
      // 真人对局:60 秒未重连判负(四国军棋:淘汰该方,其余人继续)
      room.disconnectTimer = setTimeout(() => {
        if (room.finished || room.destroyed) return;
        const back = room.players.find((p) => p.userId === me.userId);
        if (back && isConnected(io, back)) return;
        if (room.game === 'junqi') {
          eliminateJunqiSide(io, room, me.color, 'timeout');
          return;
        }
        finishGame(io, room, me.color === 'black' ? 'white-win' : 'black-win', 'timeout');
      }, RECONNECT_GRACE);
    });
  });
}
