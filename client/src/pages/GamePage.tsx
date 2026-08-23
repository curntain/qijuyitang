// 对局页:棋盘 + 对局信息侧栏(计时/将军提示/悔棋/聊天)+ 结果弹窗

import { useEffect, useRef, useState } from 'react';
import type { Player } from '@qi/shared';
import type { ChatMessage, RoomView } from '../types';
import { GAME_NAMES, colorName, formatClock, resultText } from '../types';
import { getSocket } from '../socket';
import { playCheckSound, playMoveSound } from '../sounds';
import { GomokuBoard } from '../boards/GomokuBoard';
import { GoBoard } from '../boards/GoBoard';
import { XiangqiBoard } from '../boards/XiangqiBoard';
import { ChessBoard } from '../boards/ChessBoard';
import { JunqiBoard } from '../boards/JunqiBoard';
import { JunqiSetup } from '../boards/JunqiSetup';
import type { JunqiPlacement } from '../boards/JunqiSetup';

interface Props {
  room: RoomView;
  userId: number;
  onLeave: () => void;
}

export function GamePage({ room, userId, onLeave }: Props) {
  const state = room.state;
  const me = room.players.find((p) => p.userId === userId) ?? null;
  const myColor: Player | null = me?.color ?? null;
  const myTurn = !room.finished && room.started && state.turn === myColor;
  const isVsAI = room.players.some((p) => p.isAI);
  const timeLimited = Number(room.options?.time ?? 0) > 0;
  // 房主 = 第一位玩家;两人到齐后由房主手动开始对局
  const isHost = room.players[0]?.userId === userId;
  const waitingStart = room.readyToStart && !room.started;

  // ===== 布阵(四国军棋:开赛前各自确认阵型,全员确认后自动开赛) =====
  const inSetup = room.game === 'junqi' && !room.started && !room.finished;
  const myLayoutReady = Boolean(me?.layoutReady);
  const [setupEditing, setSetupEditing] = useState(true);
  useEffect(() => {
    if (myLayoutReady) setSetupEditing(false);
  }, [myLayoutReady]);
  useEffect(() => {
    if (room.started) setSetupEditing(true); // 重置,以便下一局重新布阵
  }, [room.started]);
  const showSetup = inSetup && (!myLayoutReady || setupEditing);

  const submitLayout = (placements: JunqiPlacement[]) => {
    getSocket().emit('game:layout', { placements }, (res: { error?: string }) => {
      if (res?.error) alert(res.error);
      else setSetupEditing(false);
    });
  };

  // ===== 悔棋(四国军棋不支持) =====
  const [undoNotice, setUndoNotice] = useState('');
  const canUndoAI = room.game !== 'junqi' && isVsAI && myTurn && state.moveCount >= 2;
  const canUndoHuman = room.game !== 'junqi' && !isVsAI && room.started && !room.finished && !myTurn && state.moveCount >= 1;
  const undoRequestByMe = room.pendingUndo != null && room.pendingUndo.color === myColor;
  const undoRequestToMe = room.pendingUndo != null && room.pendingUndo.color !== myColor;

  // ===== 计时(服务端每秒广播,本地同步并为行棋方平滑递减) =====
  const [timeLeft, setTimeLeft] = useState<Partial<Record<Player, number>>>(room.timeLeft ?? {});
  useEffect(() => {
    if (room.timeLeft) setTimeLeft(room.timeLeft);
  }, [room.timeLeft]);
  useEffect(() => {
    const socket = getSocket();
    const onTime = (t: Partial<Record<Player, number>>) => setTimeLeft(t);
    socket.on('game:time', onTime);
    return () => {
      socket.off('game:time', onTime);
    };
  }, []);
  useEffect(() => {
    if (!timeLimited || room.finished || !room.started) return;
    const id = setInterval(() => {
      setTimeLeft((cur) => ({
        ...cur,
        [state.turn as Player]: Math.max(0, (cur[state.turn as Player] ?? 0) - 1000),
      }));
    }, 1000);
    return () => clearInterval(id);
  }, [timeLimited, room.finished, room.started, state.turn]);

  // ===== 聊天 =====
  const [chat, setChat] = useState<ChatMessage[]>(room.chatLog ?? []);
  const [chatInput, setChatInput] = useState('');
  const chatListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setChat(room.chatLog ?? []);
  }, [room.chatLog]);
  useEffect(() => {
    const socket = getSocket();
    const onChat = (msg: ChatMessage) => setChat((cur) => [...cur, msg]);
    socket.on('chat:message', onChat);
    return () => {
      socket.off('chat:message', onChat);
    };
  }, []);
  useEffect(() => {
    chatListRef.current?.scrollTo({ top: chatListRef.current.scrollHeight });
  }, [chat]);
  const sendChat = () => {
    const text = chatInput.trim();
    if (!text) return;
    getSocket().emit('chat:send', { text }, () => {});
    setChatInput('');
  };

  // ===== 提示音:手数增加播放落子声;出现将军播放警示音 =====
  const prevMoveCount = useRef(state.moveCount);
  const prevInCheck = useRef(Boolean(state.inCheck));
  useEffect(() => {
    if (state.moveCount > prevMoveCount.current) {
      playMoveSound();
      if (state.inCheck && !prevInCheck.current) playCheckSound();
    }
    prevMoveCount.current = state.moveCount;
    prevInCheck.current = Boolean(state.inCheck);
  }, [state.moveCount, state.inCheck]);

  // 监听悔棋结果通知,展示 5 秒后自动消失(不能用 moveCount 清除,悔棋本身会改变手数)
  useEffect(() => {
    const socket = getSocket();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onResult = (r: { accepted: boolean; name: string }) => {
      setUndoNotice(r.accepted ? `${r.name} 的悔棋请求已通过,已撤回上一手` : `${r.name} 的悔棋请求被拒绝`);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setUndoNotice(''), 5000);
    };
    socket.on('game:undo-result', onResult);
    return () => {
      if (timer) clearTimeout(timer);
      socket.off('game:undo-result', onResult);
    };
  }, []);

  const opponentDisconnected = room.players.some((p) => !p.isAI && !p.connected && p.userId !== me?.userId);

  const sendMove = (move: unknown) => {
    getSocket().emit('game:move', { move }, (res: { error?: string }) => {
      if (res?.error) console.warn(res.error);
    });
  };

  const resign = () => {
    const warn = room.game === 'junqi' ? '认输将被淘汰,确定吗?' : '确定要认输吗?';
    if (!window.confirm(warn)) return;
    getSocket().emit('game:resign', {}, () => {});
  };

  const undo = () => {
    getSocket().emit('game:undo', {}, (res: { error?: string }) => {
      if (res?.error) alert(res.error);
    });
  };

  const replyUndo = (accept: boolean) => {
    getSocket().emit('game:undo:reply', { accept }, () => {});
  };

  const startGame = () => {
    getSocket().emit('game:start', {}, (res: { error?: string }) => {
      if (res?.error) alert(res.error);
    });
  };

  const copyInviteLink = () => {
    const link = `${window.location.origin}/?room=${room.id}`;
    navigator.clipboard.writeText(link).then(() => {
      alert('邀请链接已复制:\n' + link);
    }).catch(() => {
      prompt('请手动复制邀请链接:', link);
    });
  };

  const leave = () => {
    if (room.started && !room.finished) {
      const warn = room.game === 'junqi' ? '对局中离开将被淘汰,确定离开吗?' : '对局中离开将判负,确定离开吗?';
      if (!window.confirm(warn)) return;
    }
    getSocket().emit('room:leave', {}, () => onLeave());
  };

  const renderBoard = () => {
    const props = { state, myColor, interactive: myTurn, onMove: sendMove } as any;
    switch (room.game) {
      case 'gomoku':
        return <GomokuBoard {...props} />;
      case 'go':
        return <GoBoard {...props} />;
      case 'xiangqi':
        return <XiangqiBoard {...props} />;
      case 'chess':
        return <ChessBoard {...props} />;
      case 'junqi':
        return <JunqiBoard {...props} />;
    }
  };

  const turnText = room.finished
    ? '对局结束'
    : !room.started
      ? inSetup
        ? showSetup
          ? '布阵阶段:摆放你的棋子(可自动布阵)'
          : '布阵已确认,等待其他玩家完成布阵…'
        : room.readyToStart
          ? isHost
            ? '玩家已就绪,点击下方按钮开始对局'
            : '玩家已就绪,等待房主开始对局'
          : room.game === 'junqi'
            ? '等待其他玩家加入(2-4 人)…'
            : '等待对手加入…'
      : `${colorName(room.game, state.turn)}行棋${state.turn === myColor ? '(轮到你)' : ''}`;

  return (
    <div className="game-page">
      <div className="game-main">
        {showSetup ? (
          <JunqiSetup myColor={myColor ?? 'black'} onSubmit={submitLayout} initial={me?.myLayout ?? undefined} />
        ) : (
          <div className="board-wrap">{renderBoard()}</div>
        )}
        {room.finished && (
          <div className="result-mask">
            <div className="result-card">
              <h2>{resultText(room, myColor)}</h2>
              <button className="primary" onClick={leave}>返回大厅</button>
            </div>
          </div>
        )}
      </div>

      <aside className="game-side">
        <h2>
          {GAME_NAMES[room.game]}
          <span className="room-id">房号 {room.id}</span>
        </h2>
        <ul className="player-list">
          {room.players.map((p) => (
            <li key={p.color} className={state.turn === p.color && !room.finished ? 'active' : ''}>
              <span className={`dot ${p.color} ${room.game}`} />
              <span className="p-name">
                {p.name}
                {p.isAI && <em> AI</em>}
                {!p.isAI && !p.connected && <em className="offline"> 离线</em>}
                {inSetup && p.layoutReady && <em className="ok"> 已布阵</em>}
              </span>
              {timeLimited && (
                <span className={`clock${state.turn === p.color && !room.finished ? ' ticking' : ''}`}>
                  {formatClock(timeLeft[p.color] ?? 0)}
                </span>
              )}
              <span className="p-color">
                {colorName(room.game, p.color)}
                {room.game === 'junqi' && state.eliminated?.includes(p.color) && (
                  <em className="offline"> 已淘汰</em>
                )}
              </span>
            </li>
          ))}
        </ul>

        <div className="turn-banner">{turnText}</div>
        {state.inCheck && !room.finished && (
          <div className="check-banner">将军!{myTurn ? ' 你的将/王正被攻击' : ''}</div>
        )}
        {opponentDisconnected && !room.finished && (
          <div className="warn-banner">
            {room.game === 'junqi' ? '有玩家断线,60 秒内未重连将被淘汰' : '对手已断线,60 秒内未重连将判你获胜'}
          </div>
        )}

        {undoNotice && <div className="warn-banner">{undoNotice}</div>}
        {undoRequestByMe && (
          <div className="warn-banner">已请求悔棋,等待对方确认…</div>
        )}
        {undoRequestToMe && (
          <div className="undo-request">
            <div>对手 {room.pendingUndo!.name} 请求悔棋(撤回上一手),是否同意?</div>
            <div className="undo-request-actions">
              <button className="primary small" onClick={() => replyUndo(true)}>同意</button>
              <button className="ghost small" onClick={() => replyUndo(false)}>拒绝</button>
            </div>
          </div>
        )}

        {room.game === 'go' && !room.finished && (
          <div className="captures-info">
            提子:黑 {state.captures?.black ?? 0} / 白 {state.captures?.white ?? 0}
          </div>
        )}

        <div className="game-actions">
          {waitingStart && isHost && room.game !== 'junqi' && (
            <button className="primary" onClick={startGame}>开始对局</button>
          )}
          {inSetup && myLayoutReady && !showSetup && (
            <button className="ghost" onClick={() => setSetupEditing(true)}>修改布阵</button>
          )}
          {!room.finished && room.players.length < (room.game === 'junqi' ? 4 : 2) && (
            <button className="primary" onClick={copyInviteLink}>
              复制邀请链接
            </button>
          )}
          {canUndoAI && (
            <button className="ghost" onClick={undo}>悔棋(撤回一回合)</button>
          )}
          {canUndoHuman && (
            <button className="ghost" onClick={undo} disabled={room.pendingUndo != null}>
              请求悔棋(撤回上一手)
            </button>
          )}
          {room.game === 'go' && myTurn && (
            <button className="ghost" onClick={() => sendMove({ pass: true })}>虚手(停一手)</button>
          )}
          {!room.finished && room.started && (
            <button className="danger" onClick={resign}>认输</button>
          )}
          <button className="ghost" onClick={leave}>
            {room.finished ? '返回大厅' : '离开房间'}
          </button>
        </div>

        <div className="move-count">第 {state.moveCount} 手</div>

        <div className="chat-box">
          <div className="chat-title">房间聊天</div>
          <div className="chat-list" ref={chatListRef}>
            {chat.length === 0 ? (
              <div className="chat-empty">暂无消息,打个招呼吧</div>
            ) : (
              chat.map((m, i) => (
                <div key={i} className={`chat-msg${m.color === myColor ? ' mine' : ''}`}>
                  <span className="chat-name">{m.name}</span>
                  <span className="chat-text">{m.text}</span>
                </div>
              ))
            )}
          </div>
          <div className="chat-input">
            <input
              type="text"
              placeholder="输入消息…"
              maxLength={200}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendChat();
              }}
            />
            <button className="primary small" onClick={sendChat} disabled={!chatInput.trim()}>
              发送
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
