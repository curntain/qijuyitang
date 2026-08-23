// 围棋棋盘:9/13/19 路,点击交叉点落子

import { useEffect, useRef, useState } from 'react';
import type { GoState } from '@qi/shared';
import type { Player } from '@qi/shared';

const SIZE = 620;
const MARGIN = 34;

interface Props {
  state: GoState;
  myColor: Player | null;
  interactive: boolean;
  onMove: (move: { x: number; y: number } | { pass: true }) => void;
}

const STARS: Record<number, number[][]> = {
  9: [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]],
  13: [[3, 3], [9, 3], [6, 6], [3, 9], [9, 9]],
  19: [
    [3, 3], [9, 3], [15, 3],
    [3, 9], [9, 9], [15, 9],
    [3, 15], [9, 15], [15, 15],
  ],
};

export function GoBoard({ state, interactive, onMove }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  // 防误触:第一下点击仅预览,再点同一位置才真正落子
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const n = state.size;
  const cell = (SIZE - MARGIN * 2) / (n - 1);

  // 局面变化或失去行棋权时清除预览(如对方悔棋、回合切换)
  useEffect(() => {
    setPending(null);
  }, [state, interactive]);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#e8c17a';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = '#5b4023';
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const p = MARGIN + i * cell;
      ctx.beginPath();
      ctx.moveTo(MARGIN, p);
      ctx.lineTo(SIZE - MARGIN, p);
      ctx.moveTo(p, MARGIN);
      ctx.lineTo(p, SIZE - MARGIN);
      ctx.stroke();
    }
    for (const [sx, sy] of STARS[n] ?? []) {
      ctx.beginPath();
      ctx.arc(MARGIN + sx * cell, MARGIN + sy * cell, n >= 19 ? 3.5 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#5b4023';
      ctx.fill();
    }
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = state.board[y][x];
        if (!v) continue;
        const px = MARGIN + x * cell;
        const py = MARGIN + y * cell;
        ctx.beginPath();
        ctx.arc(px, py, cell * 0.46, 0, Math.PI * 2);
        ctx.fillStyle = v === 1 ? '#1a1a1a' : '#f7f5f0';
        ctx.fill();
        ctx.strokeStyle = v === 1 ? '#000' : '#999';
        ctx.stroke();
      }
    }
    if (state.lastMove && !('pass' in state.lastMove)) {
      const { x, y } = state.lastMove;
      ctx.beginPath();
      ctx.arc(MARGIN + x * cell, MARGIN + y * cell, cell * 0.15, 0, Math.PI * 2);
      ctx.fillStyle = '#e74c3c';
      ctx.fill();
    }
    // 待确认的预览子(半透明 + 虚线框,提示再点一下确认)
    if (pending && !state.board[pending.y][pending.x]) {
      const px = MARGIN + pending.x * cell;
      const py = MARGIN + pending.y * cell;
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.46, 0, Math.PI * 2);
      ctx.fillStyle = state.turn === 'black' ? 'rgba(26,26,26,0.45)' : 'rgba(247,245,240,0.45)';
      ctx.fill();
      ctx.beginPath();
      ctx.setLineDash([4, 3]);
      ctx.arc(px, py, cell * 0.52, 0, Math.PI * 2);
      ctx.strokeStyle = '#e67e22';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [state, n, cell, pending]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    const rect = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * SIZE;
    const py = ((e.clientY - rect.top) / rect.height) * SIZE;
    const x = Math.round((px - MARGIN) / cell);
    const y = Math.round((py - MARGIN) / cell);
    if (x < 0 || y < 0 || x >= n || y >= n) return;
    const cx = MARGIN + x * cell;
    const cy = MARGIN + y * cell;
    if (Math.hypot(px - cx, py - cy) > cell * 0.45) return;
    // 第二次点击同一位置 → 确认落子;否则仅设置/移动预览
    if (pending && pending.x === x && pending.y === y) {
      setPending(null);
      onMove({ x, y });
      return;
    }
    setPending({ x, y });
  };

  return <canvas ref={ref} className="board-canvas" onClick={handleClick} />;
}
