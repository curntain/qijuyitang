// 四国军棋棋盘:17×17 交叉点,实体军棋盘风格(深红底/金色兵站方格/金色双轨铁路/行营金圈/大本营横幅);
// 棋子为方形(与现实中军棋棋子一致,比兵站格略大);选子 → 高亮可走目标 → 点击目标走子;
// 按自己方位自动旋转(己方在下);战争迷雾:非己方棋子一律显示为灰色 '?'。

import { useEffect, useMemo, useRef, useState } from 'react';
import { JUNQI_N, PIECE_NAMES, junqiEngine } from '@qi/shared';
import type { JunqiMove, JunqiState, Player, Point } from '@qi/shared';
import { BOARD_H as H, BOARD_W as W, BOARD_BG, CELL, MARGIN, drawBoardBase } from './junqiArt';

// 各方棋子配色;'?' 为迷雾中的敌子
const SIDE_STYLE: Record<string, { fill: string; border: string; text: string }> = {
  black: { fill: '#f4f6f7', border: '#3a464f', text: '#2a2f36' },
  white: { fill: '#ffffff', border: '#8a9099', text: '#2a2f36' },
  red: { fill: '#f4f6f7', border: '#c0392b', text: '#2a2f36' },
  blue: { fill: '#f4f6f7', border: '#2e6fb7', text: '#2a2f36' },
  '?': { fill: '#b8bdc1', border: '#8a9099', text: '#4a5056' },
};

// 长方形棋子:竖向矩形,现实中军棋棋子为长方块
const PIECE_W = CELL * 0.58;
const PIECE_H = CELL * 0.8;
const PIECE_R = 4; // 圆角半径

/** 以 (cx,cy) 为中心画圆角矩形 */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  r: number,
): void {
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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

    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(0, 0, W, H);

    // 实体军棋盘风格底图(公路/铁路/兵站金框格/行营金圈/大本营横幅/中央山字/金框)
    drawBoardBase(ctx, (p) => px(p.x, p.y));

    // 可走目标提示:空位绿点,敌子金框(深红底上金色更醒目)
    for (const t of targets) {
      const { cx, cy } = px(t.to.x, t.to.y);
      const occupied = state.board[t.to.y][t.to.x] != null;
      if (occupied) {
        roundRectPath(ctx, cx, cy, PIECE_W + 4, PIECE_H + 4, PIECE_R);
        ctx.strokeStyle = 'rgba(238, 194, 95, 0.95)';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(96, 224, 122, 0.8)';
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
        // 长方形棋子
        roundRectPath(ctx, cx, cy, PIECE_W, PIECE_H, PIECE_R);
        ctx.fillStyle = style.fill;
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = style.border;
        ctx.stroke();
        if (isSel) {
          roundRectPath(ctx, cx, cy, PIECE_W + 6, PIECE_H + 6, PIECE_R + 1);
          ctx.strokeStyle = '#e67e22';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.fillStyle = style.text;
        ctx.font = `bold ${CELL * 0.26}px serif`;
        ctx.fillText(p.type === '?' ? '?' : (PIECE_NAMES[p.type] ?? '?'), cx, cy + 1);
      }
    }

    // 最后一手标记
    if (state.lastMove) {
      for (const pt of [state.lastMove.from, state.lastMove.to]) {
        const { cx, cy } = px(pt.x, pt.y);
        roundRectPath(ctx, cx, cy, PIECE_W + 6, PIECE_H + 6, PIECE_R + 1);
        ctx.strokeStyle = 'rgba(230, 126, 34, 0.85)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }

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

  return (
    <div className="junqi-board-wrap">
      <canvas ref={ref} className="board-canvas" onClick={handleClick} />
      <div className="board-legend">
        兵站=白块 · 行营=圆圈 · 大本营=黑底白字 · 双轨=铁路 · 灰块?=对方棋子
      </div>
    </div>
  );
}
