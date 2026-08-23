import { describe, expect, it } from 'vitest';
import { gomokuEngine } from '../src/games/gomoku.js';

describe('五子棋规则', () => {
  it('黑先,落子后交换行棋方', () => {
    let s = gomokuEngine.initialState();
    expect(s.turn).toBe('black');
    s = gomokuEngine.applyMove(s, { x: 7, y: 7 });
    expect(s.turn).toBe('white');
  });

  it('已有子的点不能重复落子', () => {
    let s = gomokuEngine.initialState();
    s = gomokuEngine.applyMove(s, { x: 7, y: 7 });
    expect(gomokuEngine.isLegalMove(s, { x: 7, y: 7 })).toBe(false);
    expect(() => gomokuEngine.applyMove(s, { x: 7, y: 7 })).toThrow();
  });

  it('横向连五判胜', () => {
    let s = gomokuEngine.initialState();
    // 黑走横排五子,白走另一行
    for (let i = 0; i < 5; i++) {
      s = gomokuEngine.applyMove(s, { x: 3 + i, y: 7 });
      if (i < 4) s = gomokuEngine.applyMove(s, { x: 3 + i, y: 2 });
    }
    expect(gomokuEngine.getStatus(s)).toBe('black-win');
  });

  it('斜向连五判胜', () => {
    let s = gomokuEngine.initialState();
    for (let i = 0; i < 5; i++) {
      s = gomokuEngine.applyMove(s, { x: i, y: i });
      if (i < 4) s = gomokuEngine.applyMove(s, { x: 10, y: i });
    }
    expect(gomokuEngine.getStatus(s)).toBe('black-win');
  });

  it('四连不算胜', () => {
    let s = gomokuEngine.initialState();
    for (let i = 0; i < 4; i++) {
      s = gomokuEngine.applyMove(s, { x: 3 + i, y: 7 });
      if (i < 3) s = gomokuEngine.applyMove(s, { x: 3 + i, y: 2 });
    }
    expect(gomokuEngine.getStatus(s)).toBe('playing');
  });
});
