import { describe, expect, it } from 'vitest';
import { goEngine, scoreArea } from '../src/games/go.js';

describe('围棋规则', () => {
  it('默认 9 路棋盘,可指定 19 路', () => {
    expect(goEngine.initialState().size).toBe(9);
    expect(goEngine.initialState({ size: 19 }).size).toBe(19);
    expect(goEngine.initialState({ size: 12 }).size).toBe(9); // 非法值回退
  });

  it('角上单子可被提掉', () => {
    let s = goEngine.initialState();
    s = goEngine.applyMove(s, { x: 1, y: 0 }); // 黑
    s = goEngine.applyMove(s, { x: 0, y: 0 }); // 白占角
    s = goEngine.applyMove(s, { x: 0, y: 1 }); // 黑封口,提子
    expect(s.board[0][0]).toBe(0);
    expect(s.captures.black).toBe(1);
  });

  it('禁自尽:无气且不能提子的点不能落', () => {
    let s = goEngine.initialState();
    s = goEngine.applyMove(s, { x: 5, y: 5 }); // 黑占位
    s = goEngine.applyMove(s, { x: 1, y: 0 }); // 白
    s = goEngine.applyMove(s, { x: 6, y: 6 }); // 黑占位
    s = goEngine.applyMove(s, { x: 0, y: 1 }); // 白
    // 黑走 (0,0):邻点全白,无提子 → 自尽
    expect(goEngine.isLegalMove(s, { x: 0, y: 0 })).toBe(false);
  });

  it('简单位打劫:不能立即回提', () => {
    let s = goEngine.initialState();
    const seq = [
      { x: 1, y: 0 }, // 黑
      { x: 2, y: 0 }, // 白
      { x: 0, y: 1 }, // 黑
      { x: 3, y: 1 }, // 白
      { x: 1, y: 2 }, // 黑
      { x: 2, y: 2 }, // 白
      { x: 5, y: 5 }, // 黑占位
      { x: 1, y: 1 }, // 白:仅剩一气
    ];
    for (const m of seq) s = goEngine.applyMove(s, m);
    s = goEngine.applyMove(s, { x: 2, y: 1 }); // 黑提白一子
    expect(s.captures.black).toBe(1);
    expect(s.board[1][1]).toBe(0);
    expect(s.koPoint).toEqual({ x: 1, y: 1 });
    // 白不能立即回提
    expect(goEngine.isLegalMove(s, { x: 1, y: 1 })).toBe(false);
    // 白走别处后劫争解除
    s = goEngine.applyMove(s, { x: 8, y: 8 });
    s = goEngine.applyMove(s, { x: 7, y: 8 });
    expect(goEngine.isLegalMove(s, { x: 1, y: 1 })).toBe(true);
  });

  it('双方虚手后终局,空盘白贴目胜', () => {
    let s = goEngine.initialState();
    s = goEngine.applyMove(s, { pass: true });
    s = goEngine.applyMove(s, { pass: true });
    expect(goEngine.getStatus(s)).toBe('white-win');
    const score = scoreArea(s);
    expect(score.white).toBe(7.5);
  });

  it('数子:围住的空点算地域', () => {
    // 9 路盘上黑棋占住左上角 (0,0),(1,0),(0,1),围住的地为空 → 直接摆形状
    let s = goEngine.initialState();
    // 黑在二路围住角上一空点 (0,0):黑 (1,0) 与 (0,1)
    s = goEngine.applyMove(s, { x: 1, y: 0 });
    s = goEngine.applyMove(s, { x: 8, y: 8 }); // 白占位
    s = goEngine.applyMove(s, { x: 0, y: 1 });
    s = goEngine.applyMove(s, { pass: true });
    s = goEngine.applyMove(s, { pass: true });
    const score = scoreArea(s);
    // 黑:2 子 + 角上 (0,0) 1 空 = 3
    expect(score.black).toBe(3);
  });

  it('支持 firstTurn 指定白方先行', () => {
    expect(goEngine.initialState({ firstTurn: 'white' }).turn).toBe('white');
    expect(goEngine.initialState({ firstTurn: 'black' }).turn).toBe('black');
  });
});
