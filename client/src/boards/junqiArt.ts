// 四国军棋棋盘绘制:浅灰底 + 黑白灰标记,行列布局参考第二张参考图
// 兵站=白色小方块 · 行营=圆 · 大本营=黑底白字 · 黑线连接兵站/行营 · 中央铁路连四方 · 不画"山"字
// 17×17 交叉点几何沿用 shared 引擎定义(不改规则),仅重做视觉

import { CAMP_SET, CROSS_SET, HQ_SET, JUNQI_N, LINK_EDGES, RAIL_EDGES, ROAD_EDGES, ZONE_CELL_SET } from '@qi/shared';
import type { Point } from '@qi/shared';

export const CELL = 50;
export const MARGIN = 34;
export const BOARD_W = MARGIN * 2 + CELL * (JUNQI_N - 1);
export const BOARD_H = BOARD_W;

// ===== 木质底 · 深黑线/白格 =====
export const BOARD_BG = '#c39a5c'; // 木底(被 drawBoardBase 覆盖,仅作预填充兜底)
const LINE = 'rgba(40, 45, 52, 0.9)'; // 黑连线
const RAIL = '#23262a'; // 铁道(深黑)
const RAIL_TIE = 'rgba(255, 255, 255, 0.95)'; // 枕木(白色小格)
const POST_FILL = '#ffffff'; // 兵站白底
const POST_BORDER = 'rgba(58, 63, 70, 0.7)';
const POST_TEXT = '#3a3f46';
const CAMP_FILL = '#f2f4f5'; // 行营浅底
const CAMP_LINE = '#3a3f46';
const CAMP_TEXT = '#3a3f46';
const HQ_BG = '#23262a'; // 大本营黑底
const HQ_TEXT = '#ffffff'; // 大本营白字
const FRAME = '#8a9099'; // 外框灰

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

/** 木质平底(纯色,无木纹/无渐变) */
export function drawBoardWood(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = BOARD_BG;
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);
}

/** 铁路:双轨 + 枕木,连接四个国家 */
export function drawRailway(
  ctx: CanvasRenderingContext2D,
  edges: [Point, Point][],
  project: (p: Point) => { cx: number; cy: number },
): void {
  const GAP = 3.6;
  for (const sign of [1, -1]) {
    ctx.strokeStyle = RAIL;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'butt';
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
  ctx.strokeStyle = RAIL_TIE;
  ctx.lineWidth = 2.6;
  for (const [a, b] of edges) {
    const pa = project(a);
    const pb = project(b);
    const dx = pb.cx - pa.cx;
    const dy = pb.cy - pa.cy;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const steps = Math.max(1, Math.round(len / 18));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = pa.cx + dx * t;
      const cy = pa.cy + dy * t;
      ctx.beginPath();
      ctx.moveTo(cx - nx * GAP, cy - ny * GAP);
      ctx.lineTo(cx + nx * GAP, cy + ny * GAP);
      ctx.stroke();
    }
  }
}

/** 兵站:各方阵地中非行营 / 非大本营的交叉点画白色小方块 */
function drawPosts(ctx: CanvasRenderingContext2D, project: (p: Point) => { cx: number; cy: number }): void {
  const zoneKeys: string[] = [];
  for (const c of ['black', 'white', 'red', 'blue'] as const) {
    for (const key of ZONE_CELL_SET[c]) zoneKeys.push(key);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = CELL * 0.82;
  const h = CELL * 0.48;
  for (const key of zoneKeys) {
    if (CAMP_SET.has(key) || HQ_SET.has(key)) continue;
    const [x, y] = key.split(',').map(Number);
    const { cx, cy } = project({ x, y });
    roundRectPath(ctx, cx, cy, w, h, 3);
    ctx.fillStyle = POST_FILL;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = POST_BORDER;
    ctx.stroke();
    ctx.fillStyle = POST_TEXT;
    ctx.font = `bold ${Math.round(CELL * 0.2)}px serif`;
    ctx.fillText('兵站', cx, cy + 0.5);
  }
}

/** 行营:每方 5 个圆圈,圆心"行营"二字不超出圆 */
function drawCamps(ctx: CanvasRenderingContext2D, project: (p: Point) => { cx: number; cy: number }): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const r = CELL * 0.5;
  for (const key of CAMP_SET) {
    const [x, y] = key.split(',').map(Number);
    const { cx, cy } = project({ x, y });
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = CAMP_FILL;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = CAMP_LINE;
    ctx.stroke();
    ctx.fillStyle = CAMP_TEXT;
    ctx.font = `bold ${Math.round(CELL * 0.32)}px serif`; // ~11px,两字约 22px < 直径 36px
    ctx.fillText('行营', cx, cy + 1);
  }
}

/** 中央铁路交叉的 9 个十字格(行棋时可落子,画白色十字) */
function drawCrossCells(ctx: CanvasRenderingContext2D, project: (p: Point) => { cx: number; cy: number }): void {
  const s = CELL * 0.11; // 十字臂半宽
  const L = CELL * 0.28; // 十字臂半长
  for (const key of CROSS_SET) {
    const [x, y] = key.split(',').map(Number);
    const { cx, cy } = project({ x, y });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - s, cy - L, s * 2, L * 2);
    ctx.fillRect(cx - L, cy - s, L * 2, s * 2);
  }
}

/** 大本营:每方底线两格(第 2、4 格)画黑底白字 */
function drawHQ(ctx: CanvasRenderingContext2D, project: (p: Point) => { cx: number; cy: number }): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = CELL * 0.92;
  const h = CELL * 0.56;
  for (const key of HQ_SET) {
    const [x, y] = key.split(',').map(Number);
    const { cx, cy } = project({ x, y });
    roundRectPath(ctx, cx, cy, w, h, 4);
    ctx.fillStyle = HQ_BG;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#00000080';
    ctx.stroke();
    ctx.fillStyle = HQ_TEXT;
    ctx.font = `bold ${Math.round(CELL * 0.26)}px serif`; // ~9px,三字约 27px 可放入
    ctx.fillText('大本营', cx, cy + 1);
  }
}

/** 外框:灰框 */
function drawBorder(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = FRAME;
  ctx.lineWidth = 4;
  ctx.strokeRect(2.5, 2.5, BOARD_W - 5, BOARD_H - 5);
  ctx.strokeStyle = 'rgba(58, 63, 70, 0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(9.5, 9.5, BOARD_W - 19, BOARD_H - 19);
}

/** 四个空角:规则说明面板(吃子/胜负/阵地/铁路) */
function drawRulePanels(ctx: CanvasRenderingContext2D, project: (p: Point) => { cx: number; cy: number }): void {
  const draw = (title: string, lines: string[], bx: number, by: number) => {
    const p = project({ x: bx, y: by });
    const lh = Math.round(CELL * 0.34);
    const fs = Math.round(CELL * 0.28);
    const titleFs = Math.round(CELL * 0.32);
    // 黑字直接印在木底上,无框
    const blockH = titleFs + lines.length * lh;
    const top = p.cy - blockH / 2;
    const face = '"PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#241a0e';
    ctx.font = `bold ${titleFs}px ${face}`;
    ctx.fillText(title, p.cx, top + titleFs / 2);
    ctx.font = `${fs}px ${face}`;
    lines.forEach((ln, i) => ctx.fillText(ln, p.cx, top + titleFs + lh / 2 + i * lh));
  };
  draw('吃子规则', ['军衔从大到小:', '司令>军长>师长>旅长', '团长>营长>连长>排长>工兵', '大吃小,同级同归于尽', '炸弹与任何子同归;工兵挖雷'], 2.5, 2.5);
  draw('胜利判定', ['夺取对方军旗即胜', '对方无子可动亦胜', '组队时一队全灭即对方胜'], 13.5, 2.5);
  draw('阵地要点', ['行营内棋子不可被攻击', '对战中可走进空行营', '军旗、地雷不可移动', '可杀入对方大本营夺旗'], 2.5, 13.5);
  draw('铁路提示', ['铁路可直线快速移动', '工兵可在交叉口转弯', '白色十字格可落脚站子', '首排兵站可一步上铁路'], 13.5, 13.5);
}

/** 军棋盘底图:木底 / 黑线 / 兵站白块 / 行营圆圈 / 大本营黑底白字 / 中央铁路 / 外框 */
export function drawBoardBase(
  ctx: CanvasRenderingContext2D,
  project: (p: Point) => { cx: number; cy: number },
): void {
  drawBoardWood(ctx);

  // 公路(黑线,连接兵站与行营)
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.1;
  ctx.lineCap = 'round';
  for (const [a, b] of ROAD_EDGES) {
    const pa = project(a);
    const pb = project(b);
    ctx.beginPath();
    ctx.moveTo(pa.cx, pa.cy);
    ctx.lineTo(pb.cx, pb.cy);
    ctx.stroke();
  }

  // 中央铁路(连接四个国家,先画,兵站首排叠在其上)
  drawRailway(ctx, RAIL_EDGES, project);
  // 首排兵站 → 中央铁路的接轨段,同样画成铁路样式
  drawRailway(ctx, LINK_EDGES, project);
  // 中央交叉十字格
  drawCrossCells(ctx, project);

  // 兵站 / 行营 / 大本营
  drawPosts(ctx, project);
  drawCamps(ctx, project);
  drawHQ(ctx, project);

  drawBorder(ctx);
  // 四角规则说明
  drawRulePanels(ctx, project);
}
