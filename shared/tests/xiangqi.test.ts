import { describe, expect, it } from 'vitest';
import { xiangqiEngine, isInCheck } from '../src/games/xiangqi.js';
import type { XiangqiState } from '../src/games/xiangqi.js';
import type { Piece } from '../src/games/xiangqi.js';

function emptyBoard(): (Piece | null)[][] {
  return Array.from({ length: 10 }, () => new Array<Piece | null>(9).fill(null));
}

describe('中国象棋规则', () => {
  it('红方(black)先行,初始 32 子', () => {
    const s = xiangqiEngine.initialState();
    expect(s.turn).toBe('black');
    let count = 0;
    for (const row of s.board) for (const p of row) if (p) count++;
    expect(count).toBe(32);
  });

  it('车的直线走法与吃子边界', () => {
    const s = xiangqiEngine.initialState();
    // 红车 (0,9) 可上移,但不能越过己方边兵 (0,6)
    expect(xiangqiEngine.isLegalMove(s, { from: { x: 0, y: 9 }, to: { x: 0, y: 7 } })).toBe(true);
    expect(xiangqiEngine.isLegalMove(s, { from: { x: 0, y: 9 }, to: { x: 0, y: 6 } })).toBe(false);
    expect(xiangqiEngine.isLegalMove(s, { from: { x: 0, y: 9 }, to: { x: 4, y: 9 } })).toBe(false); // 车不能斜走
  });

  it('蹩马腿', () => {
    let s = xiangqiEngine.initialState();
    // 红马 (1,9) 进 (2,7),马腿 (1,8) 为空,合法
    expect(xiangqiEngine.isLegalMove(s, { from: { x: 1, y: 9 }, to: { x: 2, y: 7 } })).toBe(true);
    // 红炮 (1,7) 上移到 (1,8) 蹩住马腿
    s = xiangqiEngine.applyMove(s, { from: { x: 1, y: 7 }, to: { x: 1, y: 8 } });
    s = xiangqiEngine.applyMove(s, { from: { x: 1, y: 0 }, to: { x: 2, y: 2 } }); // 黑马暂避
    expect(xiangqiEngine.isLegalMove(s, { from: { x: 1, y: 9 }, to: { x: 2, y: 7 } })).toBe(false);
  });

  it('炮翻山吃子:隔一子才能吃,不能隔子平移', () => {
    const board = emptyBoard();
    board[9][4] = { type: 'k', side: 'black' };
    board[0][4] = { type: 'k', side: 'white' }; // 照面?中间有炮挡着
    board[7][4] = { type: 'c', side: 'black' };
    board[3][4] = { type: 'p', side: 'white' }; // 炮架
    board[0][4] = { type: 'r', side: 'white' }; // 改为车,避免照面干扰
    const s: XiangqiState = { turn: 'black', moveCount: 0, lastMove: null, board };
    // 红炮隔炮架吃白车
    expect(xiangqiEngine.isLegalMove(s, { from: { x: 4, y: 7 }, to: { x: 4, y: 0 } })).toBe(true);
    // 平移时不能越过炮架
    expect(xiangqiEngine.isLegalMove(s, { from: { x: 4, y: 7 }, to: { x: 4, y: 2 } })).toBe(false);
    // 无炮架不能吃
    expect(xiangqiEngine.isLegalMove(s, { from: { x: 4, y: 7 }, to: { x: 4, y: 1 } })).toBe(false);
  });

  it('将帅照面禁止', () => {
    const board = emptyBoard();
    board[9][4] = { type: 'k', side: 'black' };
    board[0][4] = { type: 'k', side: 'white' };
    board[5][4] = { type: 'r', side: 'black' }; // 中间红车挡着
    const s: XiangqiState = { turn: 'black', moveCount: 0, lastMove: null, board };
    // 红车离开中线 → 照面,禁止
    expect(xiangqiEngine.isLegalMove(s, { from: { x: 4, y: 5 }, to: { x: 0, y: 5 } })).toBe(false);
    // 红帅横移避免照面后,车可以离开
    expect(xiangqiEngine.isLegalMove(s, { from: { x: 4, y: 9 }, to: { x: 3, y: 9 } })).toBe(true);
    // 此时黑方(红)照面检查:帅在 (3,9) 不与白将同列
    expect(isInCheck(board, 'black')).toBe(false);
  });

  it('兵过河前只能前进,过河后可横移', () => {
    const board = emptyBoard();
    board[9][4] = { type: 'k', side: 'black' };
    board[0][4] = { type: 'k', side: 'white' };
    board[5][4] = { type: 'r', side: 'black' }; // 挡照面
    board[4][1] = { type: 'p', side: 'black' }; // 红兵已过河(y=4)
    const s: XiangqiState = { turn: 'black', moveCount: 0, lastMove: null, board };
    expect(xiangqiEngine.isLegalMove(s, { from: { x: 1, y: 4 }, to: { x: 1, y: 3 } })).toBe(true); // 前进
    expect(xiangqiEngine.isLegalMove(s, { from: { x: 1, y: 4 }, to: { x: 2, y: 4 } })).toBe(true); // 横移
    expect(xiangqiEngine.isLegalMove(s, { from: { x: 1, y: 4 }, to: { x: 1, y: 5 } })).toBe(false); // 不能后退
  });

  it('绝杀判负:无子可动', () => {
    const board = emptyBoard();
    board[9][4] = { type: 'k', side: 'black' };
    board[0][4] = { type: 'r', side: 'white' }; // 控制 4 路
    board[0][3] = { type: 'r', side: 'white' }; // 控制 3 路
    board[0][5] = { type: 'r', side: 'white' }; // 控制 5 路
    const s: XiangqiState = { turn: 'black', moveCount: 0, lastMove: null, board };
    expect(xiangqiEngine.getLegalMoves(s).length).toBe(0);
    expect(xiangqiEngine.getStatus(s)).toBe('white-win');
  });

  it('支持 firstTurn 指定白方(黑棋)先行', () => {
    expect(xiangqiEngine.initialState({ firstTurn: 'white' }).turn).toBe('white');
    expect(xiangqiEngine.initialState({ firstTurn: 'black' }).turn).toBe('black');
  });
});
