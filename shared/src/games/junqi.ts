// 四国军棋规则引擎
// 棋盘:17×17 交叉点,四方各占 6×5 阵地(南=black 北=white 东=red 西=blue),
// 中央环形铁路贯通四方,各方首排即环边。行营开局不摆子;行营内棋子不可被攻击;
// 军旗被夺或无子可动即淘汰;2-3 人各自为战,4 人时对家组队(南北 vs 东西)。
// 迷雾由服务端按玩家过滤棋子身份,引擎只依赖归属与占位,不依赖对方棋子大小。

import type { GameEngine, GameStatus, JunqiMove, Player, Point } from '../types.js';

export type JunqiColor = Player;

export interface JunqiPiece {
  side: JunqiColor | '?'; // '?' 仅出现在客户端迷雾视野中
  type: string; // siling/junzhang/.../zhadan/dilei/junqi,'?' 为隐藏
  rank: number; // 司令 9 … 工兵 1;炸弹 0;地雷 -1;军旗 -2
}

export interface JunqiState {
  turn: JunqiColor;
  moveCount: number;
  lastMove: JunqiMove | null;
  lastMoveBy: JunqiColor | null; // 上一手由谁走出(悔棋用)
  board: (JunqiPiece | null)[][]; // [y][x]
  eliminated: JunqiColor[];
  active: JunqiColor[]; // 本局参与的方向
  teamMode: boolean; // 4 人组队模式
}

export const JUNQI_N = 17;
export const JUNQI_COLORS: JunqiColor[] = ['black', 'white', 'red', 'blue'];
// 回合顺序按几何环形:南 → 东 → 北 → 西(组队时双方交替行棋)
const CYCLE: JunqiColor[] = ['black', 'red', 'white', 'blue'];

export const PIECE_DEFS: { type: string; name: string; rank: number; count: number }[] = [
  { type: 'siling', name: '司令', rank: 9, count: 1 },
  { type: 'junzhang', name: '军长', rank: 8, count: 1 },
  { type: 'shizhang', name: '师长', rank: 7, count: 2 },
  { type: 'lvzhang', name: '旅长', rank: 6, count: 2 },
  { type: 'tuanzhang', name: '团长', rank: 5, count: 2 },
  { type: 'yingzhang', name: '营长', rank: 4, count: 2 },
  { type: 'lianzhang', name: '连长', rank: 3, count: 3 },
  { type: 'paizhang', name: '排长', rank: 2, count: 3 },
  { type: 'gongbing', name: '工兵', rank: 1, count: 3 },
  { type: 'zhadan', name: '炸弹', rank: 0, count: 2 },
  { type: 'dilei', name: '地雷', rank: -1, count: 3 },
  { type: 'junqi', name: '军旗', rank: -2, count: 1 },
];
export const PIECE_NAMES: Record<string, string> = Object.fromEntries(
  PIECE_DEFS.map((d) => [d.type, d.name]),
);

const k = (x: number, y: number) => `${x},${y}`;

// 四方阵地:本地坐标 (c: 列 0..4, r: 行 0..5, r=0 底线 r=5 首排) → 全局坐标
const ZONE_MAP: Record<JunqiColor, (c: number, r: number) => Point> = {
  black: (c, r) => ({ x: 6 + c, y: 16 - r }), // 南
  white: (c, r) => ({ x: 6 + c, y: r }), // 北
  red: (c, r) => ({ x: 16 - r, y: 6 + c }), // 东
  blue: (c, r) => ({ x: r, y: 6 + c }), // 西
};
const CAMP_LOCAL = [
  [1, 2],
  [3, 2],
  [2, 3],
  [1, 4],
  [3, 4],
];
const HQ_LOCAL = [
  [1, 0],
  [3, 0],
];
// 首排指向中央环的方向(首排 → 中央铁路一步接轨)
const TOWARD_CENTER: Record<JunqiColor, Point> = {
  black: { x: 0, y: -1 },
  white: { x: 0, y: 1 },
  red: { x: -1, y: 0 },
  blue: { x: 1, y: 0 },
};

export const CAMP_SET = new Set<string>();
export const HQ_SET = new Set<string>();
/** 各方首排兵站行(炸弹/地雷不可摆;开局棋子不上铁路) */
export const FRONT_SET = new Set<string>();
/** 中央铁路交叉的 9 个十字格(行棋时可落子) */
export const CROSS_SET = new Set<string>();
export const RAIL_SET = new Set<string>();
export const CELL_SET = new Set<string>();
export const ROAD_EDGES: [Point, Point][] = [];
export const RAIL_EDGES: [Point, Point][] = [];
/** 首排兵站 → 中央铁路的接轨段(视觉上画成铁路) */
export const LINK_EDGES: [Point, Point][] = [];
/** 各方阵地 30 个交叉点集合(布阵编辑器限定可摆放区域) */
export const ZONE_CELL_SET: Record<JunqiColor, Set<string>> = {
  black: new Set(),
  white: new Set(),
  red: new Set(),
  blue: new Set(),
};

// ===== 静态棋盘构建(模块加载时执行一次) =====
function buildBoard(): void {
  // 中央"井"字铁路:3 纵(x=6/8/10)连南北、3 横(y=6/8/10)连东西
  // 交叉 9 处十字格(四边各 3 个 + 中心 1 个,散开不相邻),四方首排皆接轨
  for (const x of [6, 8, 10]) {
    for (let y = 6; y <= 10; y++) {
      RAIL_SET.add(k(x, y));
      CELL_SET.add(k(x, y));
    }
  }
  for (const y of [6, 8, 10]) {
    for (let x = 6; x <= 10; x++) {
      RAIL_SET.add(k(x, y));
      CELL_SET.add(k(x, y));
    }
  }
  for (const x of [6, 8, 10]) for (const y of [6, 8, 10]) CROSS_SET.add(k(x, y));
  for (const x of [6, 8, 10]) {
    for (let y = 6; y < 10; y++) RAIL_EDGES.push([{ x, y }, { x, y: y + 1 }]);
  }
  for (const y of [6, 8, 10]) {
    for (let x = 6; x < 10; x++) RAIL_EDGES.push([{ x, y }, { x: x + 1, y }]);
  }
  for (const color of JUNQI_COLORS) {
    const zone = ZONE_MAP[color];
    for (const [c, r] of CAMP_LOCAL) {
      const p = zone(c, r);
      CAMP_SET.add(k(p.x, p.y));
    }
    for (const [c, r] of HQ_LOCAL) {
      const p = zone(c, r);
      HQ_SET.add(k(p.x, p.y));
    }
    for (let r = 0; r <= 5; r++) {
      for (let c = 0; c <= 4; c++) {
        const p = zone(c, r);
        CELL_SET.add(k(p.x, p.y));
        ZONE_CELL_SET[color].add(k(p.x, p.y));
        if (c < 4) ROAD_EDGES.push([p, zone(c + 1, r)]);
        if (r < 5) ROAD_EDGES.push([p, zone(c, r + 1)]);
      }
    }
    // 中部斜线(行营之间)
    for (const r of [1, 2, 3]) {
      for (const c of [0, 1, 2]) {
        ROAD_EDGES.push([zone(c, r), zone(c + 1, r + 1)]);
        ROAD_EDGES.push([zone(c + 1, r), zone(c, r + 1)]);
      }
    }
    // 司令部斜线(底线两格连向中央)
    ROAD_EDGES.push([zone(1, 0), zone(2, 1)], [zone(3, 0), zone(2, 1)]);
    // 首排兵站 → 中央铁路(一步接轨;开局不摆子,行棋时可上铁路)
    const dir = TOWARD_CENTER[color];
    for (let c = 0; c <= 4; c++) {
      const p = zone(c, 5);
      FRONT_SET.add(k(p.x, p.y));
      // 仅两边(列0/4)与中间(列2)接轨,中间两个不接
      if (c === 2 || c === 0 || c === 4) {
        const to = { x: p.x + dir.x, y: p.y + dir.y };
        if (RAIL_SET.has(k(to.x, to.y))) {
          ROAD_EDGES.push([p, to]);
          LINK_EDGES.push([p, to]);
        }
      }
    }
  }
}
buildBoard();

// 公路一步邻接表
const ROAD_ADJ = new Map<string, string[]>();
for (const [a, b] of ROAD_EDGES) {
  const ka = k(a.x, a.y);
  const kb = k(b.x, b.y);
  if (!ROAD_ADJ.has(ka)) ROAD_ADJ.set(ka, []);
  if (!ROAD_ADJ.has(kb)) ROAD_ADJ.set(kb, []);
  ROAD_ADJ.get(ka)!.push(kb);
  ROAD_ADJ.get(kb)!.push(ka);
}
// 铁路一步邻接表(供工兵转弯飞行)
const RAIL_ADJ = new Map<string, string[]>();
for (const [a, b] of RAIL_EDGES) {
  const ka = k(a.x, a.y);
  const kb = k(b.x, b.y);
  if (!RAIL_ADJ.has(ka)) RAIL_ADJ.set(ka, []);
  if (!RAIL_ADJ.has(kb)) RAIL_ADJ.set(kb, []);
  RAIL_ADJ.get(ka)!.push(kb);
  RAIL_ADJ.get(kb)!.push(ka);
}

const parseKey = (s: string): Point => {
  const [x, y] = s.split(',').map(Number);
  return { x, y };
};

function isMobile(p: JunqiPiece): boolean {
  return p.rank >= 1 || p.type === 'zhadan';
}

function cloneBoard(board: (JunqiPiece | null)[][]): (JunqiPiece | null)[][] {
  return board.map((row) => row.slice());
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 各方初始布阵(随机且满足约束:军旗在司令部、地雷后两排、炸弹不在首排) */
function placePieces(board: (JunqiPiece | null)[][], color: JunqiColor, rng: () => number): void {
  const zone = ZONE_MAP[color];
  const locals: [number, number][] = [];
  for (let r = 0; r <= 5; r++) for (let c = 0; c <= 4; c++) locals.push([c, r]);
  const isCamp = (c: number, r: number) => CAMP_LOCAL.some(([cc, rr]) => cc === c && rr === r);
  const isHQ = (c: number, r: number) => HQ_LOCAL.some(([cc, rr]) => cc === c && rr === r);
  const occupied = new Set<string>();
  const at = (c: number, r: number) => k(zone(c, r).x, zone(c, r).y);
  const put = (c: number, r: number, type: string, rank: number) => {
    const p = zone(c, r);
    board[p.y][p.x] = { side: color, type, rank };
    occupied.add(at(c, r));
  };
  const pick = (candidates: [number, number][]): [number, number] => {
    const free = candidates.filter(([c, r]) => !isCamp(c, r) && !occupied.has(at(c, r)));
    return free[Math.floor(rng() * free.length)];
  };

  // 军旗 → 司令部之一
  const [fc, fr] = pick(HQ_LOCAL as [number, number][]);
  put(fc, fr, 'junqi', -2);
  // 地雷 → 后两排(底线/次底线,不含司令部)
  const backTwo = locals.filter(([c, r]) => r <= 1 && !isHQ(c, r));
  for (let i = 0; i < 3; i++) {
    const [c, r] = pick(backTwo);
    put(c, r, 'dilei', -1);
  }
  // 炸弹 → 非首排(不含司令部)
  const notFront = locals.filter(([c, r]) => r <= 4 && !isHQ(c, r));
  for (let i = 0; i < 2; i++) {
    const [c, r] = pick(notFront);
    put(c, r, 'zhadan', 0);
  }
  // 其余棋子填满剩余位置
  const rest: [number, number][] = shuffle(
    locals.filter(([c, r]) => !isCamp(c, r) && !occupied.has(at(c, r))),
    rng,
  );
  const pool: { type: string; rank: number }[] = [];
  for (const d of PIECE_DEFS) {
    if (['junqi', 'dilei', 'zhadan'].includes(d.type)) continue;
    for (let i = 0; i < d.count; i++) pool.push({ type: d.type, rank: d.rank });
  }
  shuffle(pool, rng);
  pool.forEach((pc, i) => put(rest[i][0], rest[i][1], pc.type, pc.rank));
}

function aliveColors(state: JunqiState): JunqiColor[] {
  return state.active.filter((c) => !state.eliminated.includes(c));
}

function nextTurn(state: JunqiState): JunqiColor {
  const alive = aliveColors(state);
  if (alive.length === 0) return state.turn;
  const idx = CYCLE.indexOf(state.turn);
  for (let i = 1; i <= CYCLE.length; i++) {
    const cand = CYCLE[(idx + i) % CYCLE.length];
    if (alive.includes(cand)) return cand;
  }
  return state.turn;
}

/** 战斗判定后的淘汰检查:军旗被夺或无子可动 → 清除该方全部棋子 */
function sweepEliminations(state: JunqiState): void {
  for (const color of aliveColors(state)) {
    let hasFlag = false;
    let hasMobile = false;
    for (let y = 0; y < JUNQI_N; y++) {
      for (let x = 0; x < JUNQI_N; x++) {
        const p = state.board[y][x];
        if (!p || p.side !== color) continue;
        if (p.type === 'junqi') hasFlag = true;
        if (isMobile(p)) hasMobile = true;
      }
    }
    if (hasFlag && hasMobile) continue;
    state.eliminated.push(color);
    for (let y = 0; y < JUNQI_N; y++) {
      for (let x = 0; x < JUNQI_N; x++) {
        if (state.board[y][x]?.side === color) state.board[y][x] = null;
      }
    }
  }
}

function finalStatus(state: JunqiState): GameStatus {
  const alive = aliveColors(state);
  if (state.teamMode) {
    const teamA = alive.some((c) => c === 'black' || c === 'white');
    const teamB = alive.some((c) => c === 'red' || c === 'blue');
    if (!teamA && teamB) return 'team-b-win';
    if (!teamB && teamA) return 'team-a-win';
    if (!teamA && !teamB) return 'draw';
  } else {
    if (alive.length === 1) return `${alive[0]}-win` as GameStatus;
    if (alive.length === 0) return 'draw';
  }
  return 'playing';
}

/** 收集某枚棋子的全部落点(空位 + 可攻击的敌子) */
function targetsFor(state: JunqiState, x: number, y: number): Point[] {
  const piece = state.board[y][x]!;
  const out: Point[] = [];
  const canLand = (p: Point): boolean => {
    const t = state.board[p.y][p.x];
    if (!t) return true;
    if (t.side === piece.side) return false;
    if (CAMP_SET.has(k(p.x, p.y))) return false; // 行营内不可被攻击
    return true;
  };
  const key0 = k(x, y);

  // 公路:一步
  for (const nb of ROAD_ADJ.get(key0) ?? []) {
    const p = parseKey(nb);
    if (canLand(p)) out.push(p);
  }
  if (!RAIL_SET.has(key0)) return out;

  if (piece.type === 'gongbing') {
    // 工兵:铁路上可转弯飞行
    const visited = new Set<string>([key0]);
    const queue = [key0];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const nb of RAIL_ADJ.get(cur) ?? []) {
        if (visited.has(nb)) continue;
        visited.add(nb);
        const p = parseKey(nb);
        const t = state.board[p.y][p.x];
        if (!t) {
          out.push(p);
          queue.push(nb);
        } else if (t.side !== piece.side && !CAMP_SET.has(nb)) {
          out.push(p);
        }
      }
    }
  } else {
    // 其他棋子:铁路直线滑行,不可越子
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      let cx = x + dx;
      let cy = y + dy;
      while (RAIL_SET.has(k(cx, cy))) {
        const t = state.board[cy][cx];
        if (!t) {
          out.push({ x: cx, y: cy });
        } else {
          if (t.side !== piece.side && !CAMP_SET.has(k(cx, cy))) out.push({ x: cx, y: cy });
          break;
        }
        cx += dx;
        cy += dy;
      }
    }
  }
  return out;
}

function validateMove(state: JunqiState, move: JunqiMove): string | null {
  const { from, to } = move;
  if (!from || !to) return '着法格式错误';
  if (!CELL_SET.has(k(from.x, from.y)) || !CELL_SET.has(k(to.x, to.y))) return '超出棋盘';
  if (from.x === to.x && from.y === to.y) return '起点与终点相同';
  const piece = state.board[from.y][from.x];
  if (!piece || piece.side !== state.turn) return '此处没有你的棋子';
  if (!isMobile(piece)) return '该棋子不能移动';
  const dest = state.board[to.y][to.x];
  if (dest?.side === piece.side) return '目标位置已有己方棋子';
  if (dest && CAMP_SET.has(k(to.x, to.y))) return '行营内棋子不可被攻击';
  if (!targetsFor(state, from.x, from.y).some((p) => p.x === to.x && p.y === to.y)) {
    return '该位置不可达';
  }
  return null;
}

function applyMoveInternal(state: JunqiState, move: JunqiMove): JunqiState {
  const next: JunqiState = {
    turn: state.turn,
    moveCount: state.moveCount + 1,
    lastMove: move,
    lastMoveBy: state.turn,
    board: cloneBoard(state.board),
    eliminated: state.eliminated.slice(),
    active: state.active.slice(),
    teamMode: state.teamMode,
  };
  const attacker = next.board[move.from.y][move.from.x]!;
  const defender = next.board[move.to.y][move.to.x];
  next.board[move.from.y][move.from.x] = null;

  let attackerDies = false;
  let defenderDies = false;
  if (defender) {
    defenderDies = true;
    if (attacker.type === 'zhadan') {
      attackerDies = true; // 炸弹与任何棋子同归于尽
    } else if (defender.type === 'junqi') {
      // 夺取军旗,攻方占领该位置
    } else if (defender.type === 'dilei') {
      if (attacker.type === 'gongbing') {
        // 工兵排雷,攻方存活
      } else {
        attackerDies = true;
        defenderDies = false; // 地雷保留
      }
    } else if (attacker.rank === defender.rank) {
      attackerDies = true; // 同级同归于尽
    } else if (attacker.rank < defender.rank) {
      attackerDies = true;
      defenderDies = false;
    }
  }

  // 目标格:空位 → 攻方进占;守方存活 → 保持不动;攻方存活 → 攻方占领;双亡 → 清空
  if (!defender) {
    next.board[move.to.y][move.to.x] = attacker;
  } else if (attackerDies) {
    if (defenderDies) next.board[move.to.y][move.to.x] = null;
  } else {
    next.board[move.to.y][move.to.x] = attacker;
  }
  sweepEliminations(next);
  const status = finalStatus(next);
  next.turn = status === 'playing' ? nextTurn(next) : next.turn;
  return next;
}

/** 强制淘汰一方(超时/认输/离场),返回新状态 */
export function eliminateSide(state: JunqiState, color: JunqiColor): JunqiState {
  const next: JunqiState = {
    ...state,
    board: cloneBoard(state.board),
    eliminated: state.eliminated.slice(),
  };
  if (!next.eliminated.includes(color)) {
    next.eliminated.push(color);
    for (let y = 0; y < JUNQI_N; y++) {
      for (let x = 0; x < JUNQI_N; x++) {
        if (next.board[y][x]?.side === color) next.board[y][x] = null;
      }
    }
  }
  if (finalStatus(next) === 'playing') next.turn = nextTurn(next);
  return next;
}

const PIECE_RANKS: Record<string, number> = Object.fromEntries(
  PIECE_DEFS.map((d) => [d.type, d.rank]),
);
const REQUIRED_COUNTS: Record<string, number> = Object.fromEntries(
  PIECE_DEFS.map((d) => [d.type, d.count]),
);

/** 校验玩家提交的自定义布阵:25 枚且数量合规(位置约束在 applyLayout 中逐子检查) */
export function validateLayout(types: unknown): string | null {
  if (!Array.isArray(types) || types.length !== 25) return '布阵必须包含 25 枚棋子';
  const counts: Record<string, number> = {};
  for (const t of types) {
    if (typeof t !== 'string' || !(t in REQUIRED_COUNTS)) return '布阵包含未知棋子';
    counts[t] = (counts[t] ?? 0) + 1;
  }
  for (const d of PIECE_DEFS) {
    if ((counts[d.type] ?? 0) !== d.count) {
      return `${d.name}数量必须为 ${d.count}`;
    }
  }
  return null;
}

/** 应用自定义布阵:清除该方原有棋子后逐枚摆放,返回错误信息或 null */
export function applyLayout(
  state: JunqiState,
  color: JunqiColor,
  placements: { x: number; y: number; type: string }[],
): string | null {
  if (placements.length !== 25) return '布阵必须包含 25 枚棋子';
  const zone = ZONE_CELL_SET[color];
  const used = new Set<string>();
  for (const pl of placements) {
    const key = k(pl.x, pl.y);
    const rank = PIECE_RANKS[pl.type];
    if (rank === undefined) return '布阵包含未知棋子';
    if (!zone.has(key)) return '棋子必须摆在己方阵地内';
    if (CAMP_SET.has(key)) return '行营内不能摆放棋子';
    if (used.has(key)) return '同一位置摆了多枚棋子';
    if (pl.type === 'junqi' && !HQ_SET.has(key)) return '军旗必须摆在司令部';
    if ((pl.type === 'dilei' || pl.type === 'zhadan') && (RAIL_SET.has(key) || FRONT_SET.has(key))) {
      return '炸弹/地雷不能摆在首排铁路';
    }
    used.add(key);
  }
  for (let y = 0; y < JUNQI_N; y++) {
    for (let x = 0; x < JUNQI_N; x++) {
      if (state.board[y][x]?.side === color) state.board[y][x] = null;
    }
  }
  for (const pl of placements) {
    state.board[pl.y][pl.x] = { side: color, type: pl.type, rank: PIECE_RANKS[pl.type] };
  }
  return null;
}

export const junqiEngine: GameEngine<JunqiState, JunqiMove> = {
  id: 'junqi',
  name: '四国军棋',

  initialState(options?: Record<string, unknown>): JunqiState {
    const requested = Array.isArray(options?.colors) ? (options!.colors as JunqiColor[]) : [];
    const active = requested.filter((c) => JUNQI_COLORS.includes(c));
    const colors: JunqiColor[] = active.length >= 2 ? active : ['black', 'white'];
    const rng = makeRng(Number(options?.seed ?? Date.now()) >>> 0);
    const board: (JunqiPiece | null)[][] = Array.from({ length: JUNQI_N }, () =>
      Array.from({ length: JUNQI_N }, () => null),
    );
    for (const color of colors) placePieces(board, color, rng);
    // 开局先手:支持随机指定,否则按固定循环顺序(black→white→red→blue)取首个参与方
    const first =
      options?.firstTurn && colors.includes(options.firstTurn as JunqiColor)
        ? (options.firstTurn as JunqiColor)
        : CYCLE.find((c) => colors.includes(c)) ?? colors[0];
    return {
      turn: first,
      moveCount: 0,
      lastMove: null,
      lastMoveBy: null,
      board,
      eliminated: [],
      active: colors,
      teamMode: colors.length === 4,
    };
  },

  applyMove(state, move) {
    const err = validateMove(state, move);
    if (err) throw new Error(err);
    return applyMoveInternal(state, move);
  },

  isLegalMove(state, move) {
    return validateMove(state, move) === null;
  },

  getStatus(state) {
    return finalStatus(state);
  },

  getLegalMoves(state) {
    const moves: JunqiMove[] = [];
    for (let y = 0; y < JUNQI_N; y++) {
      for (let x = 0; x < JUNQI_N; x++) {
        const p = state.board[y][x];
        if (!p || p.side !== state.turn || !isMobile(p)) continue;
        for (const t of targetsFor(state, x, y)) {
          moves.push({ from: { x, y }, to: t });
        }
      }
    }
    return moves;
  },
};
