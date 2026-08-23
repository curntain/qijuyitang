// 四国军棋引擎测试:布阵约束、着法生成、战斗判定、淘汰与胜负

import { describe, expect, it } from 'vitest';
import {
  HQ_SET,
  JUNQI_N,
  RAIL_SET,
  applyLayout,
  eliminateSide,
  junqiEngine,
  validateLayout,
} from '../src/games/junqi.js';
import type { JunqiPiece, JunqiState } from '../src/games/junqi.js';

/** 各方后两排(底线 + 次底线)的交叉点集合 */
function backRows(color: 'black' | 'white' | 'red' | 'blue'): { has(k: string): boolean }[] {
  const set = new Set<string>();
  const zone: Record<string, (c: number, r: number) => [number, number]> = {
    black: (c, r) => [6 + c, 16 - r],
    white: (c, r) => [6 + c, r],
    red: (c, r) => [16 - r, 6 + c],
    blue: (c, r) => [r, 6 + c],
  };
  for (const r of [0, 1]) for (let c = 0; c <= 4; c++) set.add(zone[color](c, r).join(','));
  return [set];
}

function emptyState(active: ('black' | 'white' | 'red' | 'blue')[] = ['black', 'white']): JunqiState {
  return {
    turn: active[0],
    moveCount: 0,
    lastMove: null,
    board: Array.from({ length: JUNQI_N }, () => Array.from({ length: JUNQI_N }, () => null)),
    eliminated: [],
    active,
    teamMode: active.length === 4,
  };
}

function put(state: JunqiState, x: number, y: number, side: string, type: string, rank: number): void {
  state.board[y][x] = { side: side as JunqiPiece['side'], type, rank };
}

describe('四国军棋:初始布阵', () => {
  it('每方 25 枚棋子,军旗在司令部,地雷在后两排,炸弹不在首排', () => {
    const state = junqiEngine.initialState({ colors: ['black', 'white'], seed: 42 });
    for (const color of ['black', 'white'] as const) {
      let count = 0;
      let flags = 0;
      for (let y = 0; y < JUNQI_N; y++) {
        for (let x = 0; x < JUNQI_N; x++) {
          const p = state.board[y][x];
          if (!p || p.side !== color) continue;
          count++;
          if (p.type === 'junqi') {
            flags++;
            expect(HQ_SET.has(`${x},${y}`)).toBe(true);
          }
          if (p.type === 'dilei') {
            // 地雷必须在己方后两排(且不在任何首排铁路)
            expect(backRows(color).some((cells) => cells.has(`${x},${y}`))).toBe(true);
          }
          if (p.type === 'zhadan') {
            // 炸弹不在首排(任何方向的首排都是铁路点)
            expect(RAIL_SET.has(`${x},${y}`)).toBe(false);
          }
        }
      }
      expect(count).toBe(25);
      expect(flags).toBe(1);
    }
  });

  it('四人模式与团队标记', () => {
    const state = junqiEngine.initialState({ colors: ['black', 'white', 'red', 'blue'], seed: 7 });
    expect(state.teamMode).toBe(true);
    expect(state.active).toHaveLength(4);
    // 每方仍为 25 子(初始布阵填满全部 25 个点位,含行营)
    for (const color of ['black', 'white', 'red', 'blue'] as const) {
      let count = 0;
      for (let y = 0; y < JUNQI_N; y++) {
        for (let x = 0; x < JUNQI_N; x++) {
          if (state.board[y][x]?.side === color) count++;
        }
      }
      expect(count).toBe(25);
    }
  });
});

describe('四国军棋:着法生成', () => {
  it('初始局面有合法着法,且全部为己方棋子出发', () => {
    const state = junqiEngine.initialState({ colors: ['black', 'white'], seed: 42 });
    const moves = junqiEngine.getLegalMoves(state);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      const p = state.board[m.from.y][m.from.x];
      expect(p?.side).toBe(state.turn);
      expect(junqiEngine.isLegalMove(state, m)).toBe(true);
    }
  });

  it('工兵在铁路上可转弯飞行', () => {
    const state = emptyState();
    // 北方方面前排行(铁路):工兵位于 (6,4),沿首排滑到 (10,4) 再转入中央环 (10,5)
    put(state, 6, 4, 'black', 'gongbing', 1);
    state.turn = 'black';
    const moves = junqiEngine.getLegalMoves(state);
    expect(moves.some((m) => m.to.x === 10 && m.to.y === 4)).toBe(true);
    expect(moves.some((m) => m.to.x === 10 && m.to.y === 5)).toBe(true);
  });

  it('非工兵棋子铁路只能直线滑行,不能转弯', () => {
    const state = emptyState();
    put(state, 6, 4, 'black', 'siling', 9);
    state.turn = 'black';
    const moves = junqiEngine.getLegalMoves(state);
    expect(moves.some((m) => m.to.x === 10 && m.to.y === 4)).toBe(true); // 沿首排滑到底
    expect(moves.some((m) => m.to.x === 10 && m.to.y === 5)).toBe(false); // 不能转弯
    expect(moves.some((m) => m.to.x === 6 && m.to.y === 5)).toBe(true); // 可转入中央环(直线)
  });

  it('行营内棋子不可被攻击', () => {
    const state = emptyState();
    // 黑方阵地行营 (7,15) 是本地 (1,1):黑方 zone(c=1,r=1) = (7,15)
    put(state, 7, 15, 'white', 'paizhang', 2); // 敌子占据行营
    put(state, 7, 16, 'black', 'siling', 9); // 司令在底线相邻位置
    state.turn = 'black';
    const moves = junqiEngine.getLegalMoves(state);
    expect(moves.some((m) => m.to.x === 7 && m.to.y === 15)).toBe(false);
  });
});

describe('四国军棋:战斗判定', () => {
  // 黑方首排 (8,12) 与次排 (8,13) 公路相邻,用作战斗测试位(均在棋盘有效交叉点上)
  const battle = (attackerType: string, attackerRank: number, defenderType: string, defenderRank: number) => {
    const state = emptyState();
    put(state, 8, 12, 'black', attackerType, attackerRank);
    put(state, 8, 13, 'white', defenderType, defenderRank);
    put(state, 6, 16, 'white', 'junqi', -2); // 白旗(防止白无旗误判)
    put(state, 9, 16, 'white', 'paizhang', 2); // 白方活子(避免无子可动被淘汰)
    put(state, 10, 0, 'black', 'junqi', -2); // 黑旗(防止黑无旗误判)
    state.turn = 'black';
    return junqiEngine.applyMove(state, { from: { x: 8, y: 12 }, to: { x: 8, y: 13 } });
  };

  it('大吃小:攻方占领目标位置', () => {
    const next = battle('siling', 9, 'lianzhang', 3);
    expect(next.board[13][8]?.side).toBe('black');
    expect(next.board[12][8]).toBeNull();
  });

  it('小碰大:攻方阵亡,守方保留', () => {
    const next = battle('lianzhang', 3, 'siling', 9);
    expect(next.board[13][8]?.side).toBe('white');
    expect(next.board[12][8]).toBeNull();
  });

  it('同级同归于尽', () => {
    const next = battle('tuanzhang', 5, 'tuanzhang', 5);
    expect(next.board[13][8]).toBeNull();
    expect(next.board[12][8]).toBeNull();
  });

  it('炸弹与任何棋子同归于尽', () => {
    const next = battle('zhadan', 0, 'siling', 9);
    expect(next.board[13][8]).toBeNull();
    expect(next.board[12][8]).toBeNull();
  });

  it('工兵可以排雷,其他棋子撞雷阵亡且地雷保留', () => {
    const ok = battle('gongbing', 1, 'dilei', -1);
    expect(ok.board[13][8]?.type).toBe('gongbing');
    const fail = battle('junzhang', 8, 'dilei', -1);
    expect(fail.board[13][8]?.type).toBe('dilei');
    expect(fail.board[12][8]).toBeNull();
  });

  it('夺取军旗即获胜(两人模式)', () => {
    const state = emptyState();
    put(state, 8, 12, 'black', 'siling', 9);
    put(state, 8, 13, 'white', 'junqi', -2);
    put(state, 6, 16, 'black', 'junqi', -2); // 黑旗(防止黑无旗误判)
    state.turn = 'black';
    const next = junqiEngine.applyMove(state, { from: { x: 8, y: 12 }, to: { x: 8, y: 13 } });
    expect(junqiEngine.getStatus(next)).toBe('black-win');
    expect(next.eliminated).toContain('white');
  });
});

describe('四国军棋:自定义布阵', () => {
  /** 从种子局面提取黑方 25 枚棋子作为合法布阵样本 */
  const extractBlack = () => {
    const seedState = junqiEngine.initialState({ colors: ['black', 'white'], seed: 3 });
    const placements: { x: number; y: number; type: string }[] = [];
    for (let y = 0; y < JUNQI_N; y++) {
      for (let x = 0; x < JUNQI_N; x++) {
        const p = seedState.board[y][x];
        if (p?.side === 'black') placements.push({ x, y, type: p.type });
      }
    }
    return placements;
  };

  it('合法布阵应用成功,棋子逐枚就位', () => {
    const placements = extractBlack();
    expect(placements).toHaveLength(25);
    expect(validateLayout(placements.map((p) => p.type))).toBeNull();
    const fresh = junqiEngine.initialState({ colors: ['black', 'white'], seed: 99 });
    expect(applyLayout(fresh, 'black', placements)).toBeNull();
    for (const pl of placements) {
      expect(fresh.board[pl.y][pl.x]?.type).toBe(pl.type);
      expect(fresh.board[pl.y][pl.x]?.side).toBe('black');
    }
  });

  it('数量不合规的布阵被拒绝', () => {
    expect(validateLayout(Array(25).fill('siling'))).toBe('司令数量必须为 1');
    expect(validateLayout(['siling'])).toBe('布阵必须包含 25 枚棋子');
  });

  it('军旗不在司令部/越出阵地的布阵被拒绝', () => {
    const placements = extractBlack();
    const flag = placements.find((p) => p.type === 'junqi')!;
    const occupant = placements.find((p) => p.x === 6 && p.y === 16)!; // 非司令部位置的原棋子,与之交换
    const fx = flag.x;
    const fy = flag.y;
    flag.x = occupant.x;
    flag.y = occupant.y;
    occupant.x = fx;
    occupant.y = fy;
    const fresh = junqiEngine.initialState({ colors: ['black'], seed: 1 });
    expect(applyLayout(fresh, 'black', placements)).toBe('军旗必须摆在司令部');
    // 越出己方阵地
    occupant.x = 0;
    occupant.y = 0;
    expect(applyLayout(fresh, 'black', placements)).toBe('棋子必须摆在己方阵地内');
  });
});

describe('四国军棋:淘汰与组队胜负', () => {
  it('四人组队:一队全灭则对方联军获胜', () => {
    const state = emptyState(['black', 'white', 'red', 'blue']);
    const next1 = eliminateSide(state, 'black');
    expect(junqiEngine.getStatus(next1)).toBe('playing');
    const next2 = eliminateSide(next1, 'white');
    expect(junqiEngine.getStatus(next2)).toBe('team-b-win');
  });

  it('淘汰后跳过该方回合', () => {
    const state = emptyState(['black', 'white', 'red']);
    state.turn = 'black';
    const next = eliminateSide(state, 'white');
    // black 之后按环形顺序(南→东→北→西)应轮到 red
    expect(next.turn).toBe('red');
  });

  it('无子可动的一方被清除', () => {
    const state = emptyState();
    put(state, 7, 16, 'black', 'junqi', -2);
    put(state, 8, 16, 'black', 'dilei', -1); // 黑方只剩旗和雷
    put(state, 7, 0, 'white', 'junqi', -2);
    put(state, 8, 0, 'white', 'gongbing', 1);
    state.turn = 'white';
    // 工兵随便走一步触发淘汰扫描(黑方无子可动)
    const next = junqiEngine.applyMove(state, { from: { x: 8, y: 0 }, to: { x: 8, y: 1 } });
    expect(next.eliminated).toContain('black');
    expect(junqiEngine.getStatus(next)).toBe('white-win');
  });
});
