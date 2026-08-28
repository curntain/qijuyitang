import { describe, expect, it } from 'vitest';
import { chessEngine } from '../src/games/chess.js';
import type { ChessState } from '../src/games/chess.js';

describe('国际象棋规则(chess.js 封装)', () => {
  it('先行方(black=白棋)走 e4 后交换行棋方', () => {
    let s = chessEngine.initialState();
    expect(s.turn).toBe('black');
    s = chessEngine.applyMove(s, { from: 'e2', to: 'e4' });
    expect(s.turn).toBe('white');
  });

  it('非法着法抛错', () => {
    const s = chessEngine.initialState();
    expect(chessEngine.isLegalMove(s, { from: 'e2', to: 'e5' })).toBe(false);
    expect(() => chessEngine.applyMove(s, { from: 'a1', to: 'a3' })).toThrow();
  });

  it('王车易位', () => {
    let s = chessEngine.initialState();
    const seq = [
      { from: 'e2', to: 'e4' },
      { from: 'e7', to: 'e5' },
      { from: 'g1', to: 'f3' },
      { from: 'b8', to: 'c6' },
      { from: 'f1', to: 'c4' },
      { from: 'f8', to: 'c5' },
    ];
    for (const m of seq) s = chessEngine.applyMove(s, m);
    expect(chessEngine.isLegalMove(s, { from: 'e1', to: 'g1' })).toBe(true);
    s = chessEngine.applyMove(s, { from: 'e1', to: 'g1' });
    // 易位后第一行应为 RNBQ1RK1(王 g1、车 f1)
    expect(s.fen.split(' ')[0].split('/').pop()).toBe('RNBQ1RK1');
  });

  it('兵的升变默认变后', () => {
    // 构造白兵在 a7、a8 空的残局 FEN
    const s: ChessState = {
      turn: 'black',
      moveCount: 0,
      lastMove: null,
      fen: '8/P7/8/8/8/8/8/k6K w - - 0 1',
    };
    const next = chessEngine.applyMove(s, { from: 'a7', to: 'a8' });
    expect(next.fen.startsWith('Q7/8')).toBe(true);
  });

  it('傻瓜将死判负', () => {
    let s = chessEngine.initialState();
    const seq = [
      { from: 'f2', to: 'f3' },
      { from: 'e7', to: 'e5' },
      { from: 'g2', to: 'g4' },
      { from: 'd8', to: 'h4' },
    ];
    for (const m of seq) s = chessEngine.applyMove(s, m);
    // 后 h4 将死执白的先行方框架角色 black → white 胜
    expect(chessEngine.getStatus(s)).toBe('white-win');
  });

  it('支持 firstTurn 指定白方(框架 white)先行', () => {
    const s = chessEngine.initialState({ firstTurn: 'white' });
    expect(s.turn).toBe('white');
    expect(s.fen).toContain(' b '); // 走子方改为黑方
  });
});
