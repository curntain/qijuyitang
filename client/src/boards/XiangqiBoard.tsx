// 中国象棋棋盘:选子 → 显示可走点 → 点击目标走子;执黑方视角自动翻转

import { useEffect, useMemo, useRef, useState } from 'react';
import { xiangqiEngine } from '@qi/shared';
import type { Player, XiangqiMove, XiangqiState } from '@qi/shared';

const CELL = 64;
const MARGIN = 40;
const W = MARGIN * 2 + CELL * 8;
const H = MARGIN * 2 + CELL * 9;

// 框架 black = 红方
const RED_CHARS: Record<string, string> = { k: '帅', a: '仕', b: '相', n: '马', r: '车', c: '炮', p: '兵' };
const BLACK_CHARS: Record<string, string> = { k: '将', a: '士', b: '象', n: '马', r: '车', c: '炮', p: '卒' };

interface Props {
  state: XiangqiState;
  myColor: Player | null;
  interactive: boolean;
  onMove: (move: XiangqiMove) => void;
}

export function XiangqiBoard({ state, myColor, interactive, onMove }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  // 执黑(黑方)时翻转棋盘,红方始终在下
  const flipped = myColor === 'white';

  const legalMoves = useMemo(
    () => (interactive ? xiangqiEngine.getLegalMoves(state) : []),
    [state, interactive],
  );
  const targets = useMemo(
    () => (selected ? legalMoves.filter((m) => m.from.x === selected.x && m.from.y === selected.y) : []),
    [legalMoves, selected],
  );

  // 棋盘坐标(x,y) → 画布像素
  const px = (x: number, y: number) => ({
    cx: MARGIN + (flipped ? 8 - x : x) * CELL,
    cy: MARGIN + (flipped ? 9 - y : y) * CELL,
  });

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#efd6a3';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#4a3319';
    ctx.lineWidth = 1.2;

    // 横线(10 条)
    for (let y = 0; y <= 9; y++) {
      ctx.beginPath();
      ctx.moveTo(MARGIN, MARGIN + y * CELL);
      ctx.lineTo(MARGIN + 8 * CELL, MARGIN + y * CELL);
      ctx.stroke();
    }
    // 竖线:边线贯通,中间线被河界断开
    for (let x = 0; x <= 8; x++) {
      if (x === 0 || x === 8) {
        ctx.beginPath();
        ctx.moveTo(MARGIN + x * CELL, MARGIN);
        ctx.lineTo(MARGIN + x * CELL, MARGIN + 9 * CELL);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(MARGIN + x * CELL, MARGIN);
        ctx.lineTo(MARGIN + x * CELL, MARGIN + 4 * CELL);
        ctx.moveTo(MARGIN + x * CELL, MARGIN + 5 * CELL);
        ctx.lineTo(MARGIN + x * CELL, MARGIN + 9 * CELL);
        ctx.stroke();
      }
    }
    // 九宫斜线
    for (const y0 of [0, 7]) {
      ctx.beginPath();
      ctx.moveTo(MARGIN + 3 * CELL, MARGIN + y0 * CELL);
      ctx.lineTo(MARGIN + 5 * CELL, MARGIN + (y0 + 2) * CELL);
      ctx.moveTo(MARGIN + 5 * CELL, MARGIN + y0 * CELL);
      ctx.lineTo(MARGIN + 3 * CELL, MARGIN + (y0 + 2) * CELL);
      ctx.stroke();
    }
    // 河界文字
    ctx.fillStyle = '#4a3319';
    ctx.font = '22px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const riverY = MARGIN + 4.5 * CELL;
    ctx.fillText(flipped ? '汉 界' : '楚 河', MARGIN + 2 * CELL, riverY);
    ctx.fillText(flipped ? '楚 河' : '汉 界', MARGIN + 6 * CELL, riverY);

    // 可走目标提示
    for (const t of targets) {
      const { cx, cy } = px(t.to.x, t.to.y);
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(46, 160, 67, 0.55)';
      ctx.fill();
    }

    // 棋子
    for (let y = 0; y <= 9; y++) {
      for (let x = 0; x <= 8; x++) {
        const p = state.board[y][x];
        if (!p) continue;
        const { cx, cy } = px(x, y);
        const isSel = selected?.x === x && selected?.y === y;
        ctx.beginPath();
        ctx.arc(cx, cy, CELL * 0.43, 0, Math.PI * 2);
        ctx.fillStyle = '#f5e6c8';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = p.side === 'black' ? '#c0392b' : '#2c3e50';
        ctx.stroke();
        if (isSel) {
          ctx.beginPath();
          ctx.arc(cx, cy, CELL * 0.48, 0, Math.PI * 2);
          ctx.strokeStyle = '#e67e22';
          ctx.stroke();
        }
        ctx.fillStyle = p.side === 'black' ? '#c0392b' : '#2c3e50';
        ctx.font = `bold ${CELL * 0.5}px serif`;
        const chars = p.side === 'black' ? RED_CHARS : BLACK_CHARS;
        ctx.fillText(chars[p.type], cx, cy + 1);
      }
    }

    // 最后一手标记
    if (state.lastMove) {
      for (const pt of [state.lastMove.from, state.lastMove.to]) {
        const { cx, cy } = px(pt.x, pt.y);
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 1.5;
        const s = 6;
        const r = CELL * 0.46;
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          ctx.beginPath();
          ctx.moveTo(cx + dx * r, cy + dy * (r - s));
          ctx.lineTo(cx + dx * r, cy + dy * r);
          ctx.lineTo(cx + dx * (r - s), cy + dy * r);
          ctx.stroke();
        }
      }
    }
  }, [state, selected, targets, flipped]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    const rect = ref.current!.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const my = ((e.clientY - rect.top) / rect.height) * H;
    let gx = Math.round((mx - MARGIN) / CELL);
    let gy = Math.round((my - MARGIN) / CELL);
    if (gx < 0 || gy < 0 || gx > 8 || gy > 9) return;
    if (flipped) {
      gx = 8 - gx;
      gy = 9 - gy;
    }
    const piece = state.board[gy][gx];
    if (selected && targets.some((t) => t.to.x === gx && t.to.y === gy)) {
      onMove({ from: selected, to: { x: gx, y: gy } });
      setSelected(null);
      return;
    }
    if (piece && piece.side === state.turn) setSelected({ x: gx, y: gy });
    else setSelected(null);
  };

  return <canvas ref={ref} className="board-canvas" onClick={handleClick} />;
}
