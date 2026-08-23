// 应用入口:登录态、页面切换、socket 事件路由

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { disconnectSocket, getSocket } from './socket';
import type { RoomView } from './types';
import { AuthPage } from './pages/AuthPage';
import { LobbyPage } from './pages/LobbyPage';
import { GamePage } from './pages/GamePage';

interface Me {
  id: number;
  username: string;
  records: { game: string; wins: number; losses: number; draws: number }[];
}

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);
  const [room, setRoom] = useState<RoomView | null>(null);

  // 启动时检查登录态
  useEffect(() => {
    api<Me>('/me')
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setChecking(false));
  }, []);

  // 监听对局状态更新
  useEffect(() => {
    if (!me) return;
    const socket = getSocket();
    const onUpdate = (view: RoomView) => {
      setRoom((cur) => (cur && cur.id === view.id ? view : cur));
    };
    socket.on('game:update', onUpdate);
    return () => {
      socket.off('game:update', onUpdate);
    };
  }, [me]);

  const handleLogin = useCallback((user: { id: number; username: string }) => {
    api<Me>('/me').then(setMe).catch(() => setMe({ ...user, records: [] }));
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await api('/logout', { method: 'POST' });
    } finally {
      disconnectSocket();
      setMe(null);
      setRoom(null);
    }
  }, []);

  const handleLeaveRoom = useCallback(() => setRoom(null), []);

  // 解析 URL 中的 ?room=XXX 参数,登录后自动加入房间
  useEffect(() => {
    if (!me) return;
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    if (!roomId) return;

    // 清除 URL 参数
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());

    // 尝试加入房间
    const socket = getSocket();
    socket.emit('room:join', { roomId }, (res: { ok?: boolean; room?: RoomView; error?: string }) => {
      if (res?.ok && res.room) {
        setRoom(res.room);
      } else {
        // 加入失败,可以在大厅显示错误提示
        console.warn('加入房间失败:', res?.error);
      }
    });
  }, [me]);

  if (checking) return <div className="loading">加载中…</div>;
  if (!me) return <AuthPage onLogin={handleLogin} />;
  if (room) return <GamePage room={room} userId={me.id} onLeave={handleLeaveRoom} />;
  return (
    <LobbyPage
      username={me.username}
      records={me.records}
      onLogout={handleLogout}
      onEnterRoom={setRoom}
    />
  );
}
