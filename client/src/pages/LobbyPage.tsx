// 大厅:房间列表、创建房间、快速人机对局、个人战绩

import { useEffect, useState } from 'react';
import type { GameId } from '@qi/shared';
import type { LobbyRoom, RoomView } from '../types';
import { GAME_NAMES } from '../types';
import { getSocket } from '../socket';

interface Props {
  username: string;
  records: { game: string; wins: number; losses: number; draws: number }[];
  onLogout: () => void;
  onEnterRoom: (room: RoomView) => void;
}

const GAME_LIST: GameId[] = ['gomoku', 'xiangqi', 'chess', 'go', 'junqi'];

export function LobbyPage({ username, records, onLogout, onEnterRoom }: Props) {
  const [rooms, setRooms] = useState<LobbyRoom[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [game, setGame] = useState<GameId>('gomoku');
  const [goSize, setGoSize] = useState(9);
  const [vsAI, setVsAI] = useState(false);
  const [humanColor, setHumanColor] = useState<'black' | 'white'>('black');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState('');
  const [timeLimit, setTimeLimit] = useState(0); // 每方用时(分钟),0=不限时

  useEffect(() => {
    const socket = getSocket();
    const onUpdate = (list: LobbyRoom[]) => setRooms(list);
    socket.on('lobby:update', onUpdate);
    socket.emit('lobby:list', (res: { ok?: boolean; rooms?: LobbyRoom[] }) => {
      if (res?.rooms) setRooms(res.rooms);
    });
    return () => {
      socket.off('lobby:update', onUpdate);
    };
  }, []);

  const createRoom = () => {
    setBusy(true);
    setError('');
    getSocket().emit(
      'room:create',
      { game, size: goSize, vsAI, humanColor, time: timeLimit },
      (res: { ok?: boolean; room?: RoomView; error?: string }) => {
        setBusy(false);
        if (res?.ok && res.room) onEnterRoom(res.room);
        else setError(res?.error ?? '创建失败');
      },
    );
  };

  const quickStart = () => {
    setBusy(true);
    setError('');
    // 快速开始:一键开一局五子棋人机对局(执黑先行)
    getSocket().emit(
      'room:create',
      { game: 'gomoku' as GameId, vsAI: true, humanColor: 'black' },
      (res: { ok?: boolean; room?: RoomView; error?: string }) => {
        setBusy(false);
        if (res?.ok && res.room) onEnterRoom(res.room);
        else setError(res?.error ?? '创建失败');
      },
    );
  };

  const joinRoom = (id: string) => {
    setError('');
    getSocket().emit('room:join', { roomId: id }, (res: { ok?: boolean; room?: RoomView; error?: string }) => {
      if (res?.ok && res.room) onEnterRoom(res.room);
      else setError(res?.error ?? '加入失败');
    });
  };

  const recordOf = (g: string) => records.find((r) => r.game === g);

  return (
    <div className="lobby">
      <header className="lobby-header">
        <h1>棋聚一堂</h1>
        <div className="header-right">
          <span className="welcome">{username}</span>
          <button className="ghost" onClick={onLogout}>退出</button>
        </div>
      </header>

      {error && <div className="banner-error">{error}</div>}

      <div className="lobby-body">
        <section className="room-panel">
          <div className="panel-title">
            <h2>在线房间</h2>
            <div className="panel-actions">
              <button className="ghost" disabled={busy} onClick={quickStart}>
                快速开始(五子棋 AI)
              </button>
              <button className="primary" onClick={() => { setShowCreate(true); setError(''); }}>
                创建房间
              </button>
            </div>
          </div>
          <div className="join-room-input">
            <input
              type="text"
              placeholder="输入房号加入房间"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
              maxLength={5}
            />
            <button
              className="primary"
              disabled={!joinRoomId || busy}
              onClick={() => {
                if (joinRoomId) joinRoom(joinRoomId);
              }}
            >
              加入
            </button>
          </div>
          {rooms.length === 0 ? (
            <div className="empty">暂无房间,点击右上角创建一个吧</div>
          ) : (
            <ul className="room-list">
              {rooms.map((r) => (
                <li key={r.id} className="room-item">
                  <div className="room-info">
                    <span className={`tag ${r.game}`}>{GAME_NAMES[r.game]}</span>
                    <span className="room-id">房号 {r.id}</span>
                    <span className="room-players">
                      {r.players.join(' vs ') || '等待中'}
                      {r.hasAI && ' (含 AI)'}
                    </span>
                    <span className="room-count">{r.count}/{r.maxPlayers} 人</span>
                  </div>
                  <div className="room-status">
                    {r.finished ? (
                      <span className="status-done">已结束</span>
                    ) : r.started ? (
                      <span className="status-playing">对局中</span>
                    ) : r.readyToStart ? (
                      <span className="status-playing">已就绪</span>
                    ) : (
                      <button className="primary small" onClick={() => joinRoom(r.id)}>
                        加入
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="side-panel">
          <h2>我的战绩</h2>
          <table className="record-table">
            <thead>
              <tr><th>棋种</th><th>胜</th><th>负</th><th>和</th></tr>
            </thead>
            <tbody>
              {GAME_LIST.map((g) => {
                const r = recordOf(g);
                return (
                  <tr key={g}>
                    <td>{GAME_NAMES[g]}</td>
                    <td>{r?.wins ?? 0}</td>
                    <td>{r?.losses ?? 0}</td>
                    <td>{r?.draws ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="hint">战绩仅统计真人对局</p>
        </aside>
      </div>

      {showCreate && (
        <div className="modal-mask" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>创建房间</h2>
            <div className="field">
              <label>选择棋种</label>
              <div className="game-options">
                {GAME_LIST.map((g) => (
                  <button
                    key={g}
                    className={game === g ? 'selected' : ''}
                    onClick={() => {
                      setGame(g);
                      if (g === 'junqi') setVsAI(false); // 军棋不支持 AI,重置选项
                    }}
                  >
                    {GAME_NAMES[g]}
                  </button>
                ))}
              </div>
            </div>
            {game === 'go' && (
              <div className="field">
                <label>棋盘大小</label>
                <div className="game-options">
                  {[9, 13, 19].map((s) => (
                    <button key={s} className={goSize === s ? 'selected' : ''} onClick={() => setGoSize(s)}>
                      {s} 路
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="field">
              <label>对手</label>
              <div className="game-options">
                <button className={!vsAI ? 'selected' : ''} onClick={() => setVsAI(false)}>真人</button>
                <button className={vsAI ? 'selected' : ''} onClick={() => setVsAI(true)} disabled={game === 'junqi'}>
                  AI{game === 'junqi' ? '(不支持)' : ''}
                </button>
              </div>
              {game === 'junqi' && (
                <p className="hint">四国军棋仅支持真人对战,2-4 人;按加入顺序入座南/北/东/西,4 人时南北组队对战东西。</p>
              )}
            </div>
            <div className="field">
              <label>每方用时</label>
              <div className="game-options">
                {[0, 5, 10, 30].map((t) => (
                  <button key={t} className={timeLimit === t ? 'selected' : ''} onClick={() => setTimeLimit(t)}>
                    {t === 0 ? '不限时' : `${t} 分钟`}
                  </button>
                ))}
              </div>
            </div>
            {vsAI && (
              <div className="field">
                <label>我的执子</label>
                <div className="game-options">
                  <button className={humanColor === 'black' ? 'selected' : ''} onClick={() => setHumanColor('black')}>
                    先手{game === 'xiangqi' ? '(红方)' : game === 'chess' ? '(白棋)' : '(黑方)'}
                  </button>
                  <button className={humanColor === 'white' ? 'selected' : ''} onClick={() => setHumanColor('white')}>
                    后手{game === 'xiangqi' ? '(黑方)' : game === 'chess' ? '(黑棋)' : '(白方)'}
                  </button>
                </div>
              </div>
            )}
            <div className="modal-actions">
              <button className="ghost" onClick={() => setShowCreate(false)}>取消</button>
              <button className="primary" disabled={busy} onClick={createRoom}>
                {busy ? '创建中…' : vsAI ? '开始人机对局' : '创建并等待对手'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
