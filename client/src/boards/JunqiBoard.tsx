// 四国军棋棋盘:17×17 交叉点,公路细线/铁路粗线/行营圆圈/司令部虚线框;
// 选子 → 高亮可走目标 → 点击目标走子;按自己方位自动旋转(己方在下);
// 战争迷雾:非己方棋子一律显示为灰色 '?'。

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CAMP_SET,
  HQ_SET,
  JUNQI_N,
  PIECE_NAMES,
  RAIL_EDGES,
  ROAD_EDGES,
  junqiEngine,
} from '@qi/shared';
import type { JunqiMove, JunqiState, Player, Point } from '@qi/shared';

const CELL = 36;
const MARGIN = 28;
const W = MARGIN * 2 + CELL * (JUNQI_N - 1);
const H = W;

// 各方棋子配色;'?' 为迷雾中的敌子
const SIDE_STYLE: Record<string, { fill: string; border: string; text: string }> = {
  black: { fill: '#3b3f4a', border: '#14161c', text: '#f5f5f5' },
  white: { fill: '#f5f0e4', border: '#b5aa90', text: '#3a3428' },
  red: { fill: '#c0392b', border: '#7e241a', text: '#ffffff' },
  blue: { fill: '#2e6fb7', border: '#1c4a80', text: '#ffffff' },
  '?': { fill: '#5c6270', border: '#3a3e48', text: '#e8e8e8' },
};

// 铁路双线画法:两条平行钢轨 + 垂直枕木,与公路细线明显区分(标准军棋棋盘样式)
function drawRailway(
  ctx: CanvasRenderingContext2D,
  edges: [Point, Point][],
  project: (p: Point) => { cx: number; cy: number },
): void {
  const GAP = 4; // 双轨间距的一半
  ctx.strokeStyle = '#332712';
  ctx.lineCap = 'butt';
  // 枕木(先画,被钢轨压住)
  ctx.lineWidth = 1.6;
  for (const [a, b] of edges) {
    const pa = project(a);
    const pb = project(b);
    const dx = pb.cx - pa.cx;
    const dy = pb.cy - pa.cy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const pxn = -uy;
    const pyn = ux;
    for (let t = CELL * 0.22; t < len - CELL * 0.1; t += CELL * 0.3) {
      const sx = pa.cx + ux * t;
      const sy = pa.cy + uy * t;
      ctx.beginPath();
      ctx.moveTo(sx + pxn * (GAP + 2), sy + pyn * (GAP + 2));
      ctx.lineTo(sx - pxn * (GAP + 2), sy - pyn * (GAP + 2));
      ctx.stroke();
    }
  }
  // 双轨(沿线方向各偏移半个轨距,端点内缩避免拐角凸出)
  ctx.lineWidth = 1.5;
  for (const sign of [1, -1]) {
    ctx.beginPath();
    for (const [a, b] of edges) {
      const pa = project(a);
      const pb = project(b);
      const dx = pb.cx - pa.cx;
      const dy = pb.cy - pa.cy;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const ox = -uy * GAP * sign;
      const oy = ux * GAP * sign;
      const inset = Math.min(2, len / 4);
      ctx.moveTo(pa.cx + ux * inset + ox, pa.cy + uy * inset + oy);
      ctx.lineTo(pb.cx - ux * inset + ox, pb.cy - uy * inset + oy);
    }
    ctx.stroke();
  }
}

interface Props {
  state: JunqiState;
  myColor: Player | null;
  interactive: boolean;
  onMove: (move: JunqiMove) => void;
}

export function JunqiBoard({ state, myColor, interactive, onMove }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);

  // 状态变化后清除选子,避免选中已不存在的棋子
  useEffect(() => {
    setSelected(null);
  }, [state, interactive]);

  // 视角旋转:把自己的一方转到棋盘下方(南=black 默认朝下)
  const viewOf = (x: number, y: number): { x: number; y: number } => {
    const n = JUNQI_N - 1;
    switch (myColor) {
      case 'white':
        return { x: n - x, y: n - y };
      case 'red':
        return { x: n - y, y: x };
      case 'blue':
        return { x: y, y: n - x };
      default:
        return { x, y };
    }
  };
  const px = (x: number, y: number) => {
    const v = viewOf(x, y);
    return { cx: MARGIN + v.x * CELL, cy: MARGIN + v.y * CELL };
  };

  const legalMoves = useMemo(
    () => (interactive ? junqiEngine.getLegalMoves(state) : []),
    [state, interactive],
  );
  const targets = useMemo(
    () => (selected ? legalMoves.filter((m) => m.from.x === selected.x && m.from.y === selected.y) : []),
    [legalMoves, selected],
  );

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#e3cf9f';
    ctx.fillRect(0, 0, W, H);

    // 公路(细线)
    ctx.strokeStyle = '#5a4526';
    ctx.lineWidth = 1;
    for (const [a, b] of ROAD_EDGES) {
      const pa = px(a.x, a.y);
      const pb = px(b.x, b.y);
      ctx.beginPath();
      ctx.moveTo(pa.cx, pa.cy);
      ctx.lineTo(pb.cx, pb.cy);
      ctx.stroke();
    }
    // 铁路(双轨 + 枕木)
    drawRailway(ctx, RAIL_EDGES, (p) => px(p.x, p.y));

    // 行营(圆圈)
    ctx.strokeStyle = '#5a4526';
    ctx.lineWidth = 1.2;
    for (const key of CAMP_SET) {
      const [x, y] = key.split(',').map(Number);
      const { cx, cy } = px(x, y);
      ctx.beginPath();
      ctx.arc(cx, cy, CELL * 0.42, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 司令部(虚线方框)
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = '#8c2f24';
    ctx.lineWidth = 1.4;
    for (const key of HQ_SET) {
      const [x, y] = key.split(',').map(Number);
      const { cx, cy } = px(x, y);
      const s = CELL * 0.42;
      ctx.strokeRect(cx - s, cy - s, s * 2, s * 2);
    }
    ctx.setLineDash([]);

    // 可走目标提示:空位绿点,敌子红圈
    for (const t of targets) {
      const { cx, cy } = px(t.to.x, t.to.y);
      const occupied = state.board[t.to.y][t.to.x] != null;
      if (occupied) {
        ctx.beginPath();
        ctx.arc(cx, cy, CELL * 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(231, 76, 60, 0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(46, 160, 67, 0.6)';
        ctx.fill();
      }
    }

    // 棋子
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let y = 0; y < JUNQI_N; y++) {
      for (let x = 0; x < JUNQI_N; x++) {
        const p = state.board[y][x];
        if (!p) continue;
        const { cx, cy } = px(x, y);
        const style = SIDE_STYLE[p.side] ?? SIDE_STYLE['?'];
        const isSel = selected?.x === x && selected?.y === y;
        ctx.beginPath();
        ctx.arc(cx, cy, CELL * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = style.fill;
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = style.border;
        ctx.stroke();
        if (isSel) {
          ctx.beginPath();
          ctx.arc(cx, cy, CELL * 0.48, 0, Math.PI * 2);
          ctx.strokeStyle = '#e67e22';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.fillStyle = style.text;
        ctx.font = `bold ${CELL * 0.34}px serif`;
        ctx.fillText(p.type === '?' ? '?' : (PIECE_NAMES[p.type] ?? '?'), cx, cy + 1);
      }
    }

    // 最后一手标记
    if (state.lastMove) {
      for (const pt of [state.lastMove.from, state.lastMove.to]) {
        const { cx, cy } = px(pt.x, pt.y);
        ctx.beginPath();
        ctx.arc(cx, cy, CELL * 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(230, 126, 34, 0.85)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }

    // 图例(中央空白区为棋盘设计,无交叉点)
    ctx.fillStyle = '#6b5a3a';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('铁路=双轨线 · 公路=细线 · 圆圈=行营 · 虚线框=司令部', W / 2, MARGIN * 0.45);
  }, [state, selected, targets, myColor]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    const rect = ref.current!.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const my = ((e.clientY - rect.top) / rect.height) * H;
    // 找到点击位置最近的交叉点(视角可能旋转,不做逆映射直接遍历)
    let gx = -1;
    let gy = -1;
    let bestD = Infinity;
    for (let y = 0; y < JUNQI_N; y++) {
      for (let x = 0; x < JUNQI_N; x++) {
        const { cx, cy } = px(x, y);
        const d = (mx - cx) ** 2 + (my - cy) ** 2;
        if (d < bestD) {
          bestD = d;
          gx = x;
          gy = y;
        }
      }
    }
    if (gx < 0 || bestD > (CELL * 0.6) ** 2) return;

    if (selected && targets.some((t) => t.to.x === gx && t.to.y === gy)) {
      onMove({ from: selected, to: { x: gx, y: gy } });
      setSelected(null);
      return;
    }
    const piece = state.board[gy][gx];
    if (piece && piece.side === state.turn) setSelected({ x: gx, y: gy });
    else setSelected(null);
  };

  return <canvas ref={ref} className="board-canvas" onClick={handleClick} />;
}
