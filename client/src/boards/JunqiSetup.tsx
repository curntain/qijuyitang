// 四国军棋布阵编辑器:开局前在己方 5×5 阵地内自由摆放 25 枚棋子,
// 也可一键"自动布阵"随机填满;约束(军旗在司令部/地雷炸弹不在首排)实时生效,
// 全员确认后由服务端自动开赛。

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CAMP_SET,
  HQ_SET,
  JUNQI_N,
  PIECE_DEFS,
  PIECE_NAMES,
  RAIL_EDGES,
  RAIL_SET,
  ROAD_EDGES,
  ZONE_CELL_SET,
} from '@qi/shared';
import type { JunqiColor, Point } from '@qi/shared';

const CELL = 36;
const MARGIN = 28;
const W = MARGIN * 2 + CELL * (JUNQI_N - 1);
const H = W;

// 己方棋子预览配色(按方位)
const SIDE_STYLE: Record<string, { fill: string; border: string; text: string }> = {
  black: { fill: '#3b3f4a', border: '#14161c', text: '#f5f5f5' },
  white: { fill: '#f5f0e4', border: '#b5aa90', text: '#3a3428' },
  red: { fill: '#c0392b', border: '#7e241a', text: '#ffffff' },
  blue: { fill: '#2e6fb7', border: '#1c4a80', text: '#ffffff' },
};

export interface JunqiPlacement {
  x: number;
  y: number;
  type: string;
}

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
  myColor: JunqiColor;
  onSubmit: (placements: JunqiPlacement[]) => void;
  submitting?: boolean;
  initial?: JunqiPlacement[]; // 已确认过的布阵回显(修改布阵时保留原阵)
}

export function JunqiSetup({ myColor, onSubmit, submitting, initial }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  // 已摆放棋子:坐标键 "x,y" → 棋子类型(修改布阵时用已确认阵型回显)
  const [placed, setPlaced] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const pl of initial ?? []) m[`${pl.x},${pl.y}`] = pl.type;
    return m;
  });
  // 手中待放的棋子类型(回显模式下默认不选中)
  const [hand, setHand] = useState<string | null>(initial?.length ? null : 'siling');

  const zoneKeys = ZONE_CELL_SET[myColor];

  // 视角旋转:把自己的一方转到棋盘下方(与对局视角一致)
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

  const placedCount = (type: string) => Object.values(placed).filter((t) => t === type).length;
  const remaining = useMemo(
    () => PIECE_DEFS.map((d) => ({ ...d, left: d.count - placedCount(d.type) })),
    [placed],
  );
  const totalLeft = remaining.reduce((s, d) => s + d.left, 0);
  const complete = totalLeft === 0;

  // 手中棋子当前可摆放的位置(满足军旗/地雷/炸弹位置约束)
  const validCells = useMemo(() => {
    const s = new Set<string>();
    if (!hand) return s;
    for (const key of zoneKeys) {
      if (placed[key]) continue;
      if (hand === 'junqi' && !HQ_SET.has(key)) continue;
      if ((hand === 'dilei' || hand === 'zhadan') && RAIL_SET.has(key)) continue;
      s.add(key);
    }
    return s;
  }, [hand, placed, zoneKeys]);

  /** 随机填满剩余位置(自动布阵),保留已手动摆放的棋子 */
  const autoFill = () => {
    const next: Record<string, string> = { ...placed };
    const pool: string[] = [];
    for (const d of remaining) {
      for (let i = 0; i < d.left; i++) pool.push(d.type);
    }
    // 先放位置受限的棋子:军旗 → 司令部,地雷/炸弹 → 非铁路
    const freeOf = (filter: (key: string) => boolean) =>
      [...zoneKeys].filter((key) => !next[key] && filter(key));
    const take = (keys: string[]): string | undefined => keys.splice(Math.floor(Math.random() * keys.length), 1)[0];
    const placeAt = (type: string, key: string | undefined) => {
      if (key) next[key] = type;
      else pool.push(type); // 放不下时兜底(理论上不会发生)
    };
    for (const type of ['junqi', 'dilei', 'dilei', 'dilei', 'zhadan', 'zhadan']) {
      const idx = pool.indexOf(type);
      if (idx === -1) continue;
      pool.splice(idx, 1);
      const candidates =
        type === 'junqi'
          ? freeOf((key) => HQ_SET.has(key))
          : freeOf((key) => !RAIL_SET.has(key));
      placeAt(type, take(candidates));
    }
    // 其余棋子随机填入剩余位置
    const rest = [...zoneKeys].filter((key) => !next[key]);
    for (const type of pool) {
      const idx = Math.floor(Math.random() * rest.length);
      next[rest[idx]] = type;
      rest.splice(idx, 1);
    }
    setPlaced(next);
    setHand(null);
  };

  const clearAll = () => {
    setPlaced({});
    setHand('siling');
  };

  const submit = () => {
    if (!complete || submitting) return;
    const placements: JunqiPlacement[] = Object.entries(placed).map(([key, type]) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y, type };
    });
    onSubmit(placements);
  };

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#e3cf9f';
    ctx.fillRect(0, 0, W, H);

    // 己方阵地高亮
    ctx.fillStyle = 'rgba(63, 124, 255, 0.10)';
    for (const key of zoneKeys) {
      const [x, y] = key.split(',').map(Number);
      const { cx, cy } = px(x, y);
      ctx.fillRect(cx - CELL / 2, cy - CELL / 2, CELL, CELL);
    }

    // 公路与铁路
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
    // 行营与司令部
    ctx.strokeStyle = '#5a4526';
    ctx.lineWidth = 1.2;
    for (const key of CAMP_SET) {
      const [x, y] = key.split(',').map(Number);
      const { cx, cy } = px(x, y);
      ctx.beginPath();
      ctx.arc(cx, cy, CELL * 0.42, 0, Math.PI * 2);
      ctx.stroke();
    }
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

    // 手中棋子的可摆放位置提示
    if (hand) {
      ctx.fillStyle = 'rgba(46, 160, 67, 0.5)';
      for (const key of validCells) {
        const [x, y] = key.split(',').map(Number);
        const { cx, cy } = px(x, y);
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 已摆放的棋子
    const style = SIDE_STYLE[myColor];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [key, type] of Object.entries(placed)) {
      const [x, y] = key.split(',').map(Number);
      const { cx, cy } = px(x, y);
      ctx.beginPath();
      ctx.arc(cx, cy, CELL * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = style.fill;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = style.border;
      ctx.stroke();
      ctx.fillStyle = style.text;
      ctx.font = `bold ${CELL * 0.34}px serif`;
      ctx.fillText(PIECE_NAMES[type] ?? '?', cx, cy + 1);
    }

    // 图例(与对局棋盘一致)
    ctx.fillStyle = '#6b5a3a';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('铁路=双轨线 · 公路=细线 · 圆圈=行营 · 虚线框=司令部', W / 2, MARGIN * 0.45);
  }, [placed, hand, validCells, myColor]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = ref.current!.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const my = ((e.clientY - rect.top) / rect.height) * H;
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
    const key = `${gx},${gy}`;
    if (gx < 0 || bestD > (CELL * 0.6) ** 2 || !zoneKeys.has(key)) return;

    if (placed[key]) {
      // 点击已摆放的棋子:移除
      const next = { ...placed };
      delete next[key];
      setPlaced(next);
      return;
    }
    if (hand && validCells.has(key)) {
      setPlaced({ ...placed, [key]: hand });
      // 该类棋子放完后自动收起
      if (placedCount(hand) + 1 >= (PIECE_DEFS.find((d) => d.type === hand)?.count ?? 0)) {
        setHand(null);
      }
    }
  };

  return (
    <div className="junqi-setup">
      <div className="setup-title">布阵阶段 — 点击下方棋子再点阵地摆放,或一键自动布阵</div>
      <div className="board-wrap">
        <canvas ref={ref} className="board-canvas" onClick={handleClick} />
      </div>
      <div className="setup-pool">
        {remaining.map((d) => (
          <button
            key={d.type}
            className={`setup-piece${hand === d.type ? ' selected' : ''}`}
            disabled={d.left === 0}
            onClick={() => setHand(hand === d.type ? null : d.type)}
          >
            {d.name} ×{d.left}
          </button>
        ))}
      </div>
      <div className="setup-actions">
        <button className="ghost" onClick={autoFill}>自动布阵(填满剩余)</button>
        <button className="ghost" onClick={clearAll}>清空重摆</button>
        <button className="primary" disabled={!complete || submitting} onClick={submit}>
          {submitting ? '提交中…' : complete ? '确认布阵' : `还需摆放 ${totalLeft} 枚`}
        </button>
      </div>
      <p className="hint">规则:军旗必须在司令部,地雷/炸弹不能摆在首排铁路;全员确认后自动开赛。</p>
    </div>
  );
}
