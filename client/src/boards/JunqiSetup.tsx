// 四国军棋布阵编辑器:开局前在己方 6×5 阵地内摆放 25 枚棋子(行营不摆),
// 也可一键"自动布阵"随机填满;约束(军旗在司令部/地雷炸弹不在首排)实时生效,
// 全员确认后由服务端自动开赛。

import { useEffect, useMemo, useRef, useState } from 'react';
import { CAMP_SET, FRONT_SET, HQ_SET, JUNQI_N, PIECE_DEFS, PIECE_NAMES, RAIL_SET, ZONE_CELL_SET } from '@qi/shared';
import type { JunqiColor } from '@qi/shared';
import { BOARD_H as H, BOARD_W as W, BOARD_BG, CELL, MARGIN, drawBoardBase } from './junqiArt';

// 己方棋子预览配色(按方位)
const SIDE_STYLE: Record<string, { fill: string; border: string; text: string }> = {
  black: { fill: '#f4f6f7', border: '#3a464f', text: '#2a2f36' },
  white: { fill: '#ffffff', border: '#8a9099', text: '#2a2f36' },
  red: { fill: '#f4f6f7', border: '#c0392b', text: '#2a2f36' },
  blue: { fill: '#f4f6f7', border: '#2e6fb7', text: '#2a2f36' },
};

export interface JunqiPlacement {
  x: number;
  y: number;
  type: string;
}

// 铁路双线画法:两条平行钢轨 + 垂直枕木,与公路细线明显区分(标准军棋棋盘样式)
// (已迁移至 ./junqiArt 供对局棋盘与布阵编辑器共用)

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
      if (CAMP_SET.has(key)) continue;
      if (hand === 'junqi' && !HQ_SET.has(key)) continue;
      if ((hand === 'dilei' || hand === 'zhadan') && (RAIL_SET.has(key) || FRONT_SET.has(key))) continue;
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
      [...zoneKeys].filter((key) => !next[key] && !CAMP_SET.has(key) && filter(key));
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
          : freeOf((key) => !RAIL_SET.has(key) && !FRONT_SET.has(key));
      placeAt(type, take(candidates));
    }
    // 其余棋子随机填入剩余位置
    const rest = [...zoneKeys].filter((key) => !next[key] && !CAMP_SET.has(key));
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

    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(0, 0, W, H);

    // 己方阵地高亮(灰底上用淡蓝提示当前玩家区域)
    ctx.fillStyle = 'rgba(66, 118, 186, 0.16)';
    for (const key of zoneKeys) {
      const [x, y] = key.split(',').map(Number);
      const { cx, cy } = px(x, y);
      ctx.fillRect(cx - CELL / 2, cy - CELL / 2, CELL, CELL);
    }

    // 公路与铁路、行营大本营等底图(实体军棋盘风格)
    drawBoardBase(ctx, (p) => px(p.x, p.y));

    // 手中棋子的可摆放位置提示
    if (hand) {
      ctx.fillStyle = 'rgba(96, 224, 122, 0.8)';
      for (const key of validCells) {
        const [x, y] = key.split(',').map(Number);
        const { cx, cy } = px(x, y);
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 已摆放的棋子(方形,与现实军棋棋子一致)
    const style = SIDE_STYLE[myColor];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [key, type] of Object.entries(placed)) {
      const [x, y] = key.split(',').map(Number);
      const { cx, cy } = px(x, y);
      roundRectPath(ctx, cx, cy, PIECE_W, PIECE_H, PIECE_R);
      ctx.fillStyle = style.fill;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = style.border;
      ctx.stroke();
      ctx.fillStyle = style.text;
      ctx.font = `bold ${CELL * 0.26}px serif`;
      ctx.fillText(PIECE_NAMES[type] ?? '?', cx, cy + 1);
    }

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
      <p className="hint">
        规则:军旗必须在司令部,地雷/炸弹不能摆在首排铁路;全员确认后自动开赛。
        (图例:黑线=公路 · 双轨=铁路 · 白块=兵站 · 圆圈=行营 · 黑底白字=大本营 · 蓝色高亮=你的阵地)
      </p>
    </div>
  );
}
