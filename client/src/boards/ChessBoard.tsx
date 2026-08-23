// 国际象棋棋盘:Unicode 棋子,选子走子,执黑(框架 white=黑棋)视角翻转

import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { chessEngine } from '@qi/shared';
import type { ChessMove, ChessState, Player } from '@qi/shared';

const CELL = 72;
const SIZE = CELL * 8;

const GLYPHS: Record<string, string> = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟',
};

interface Props {
  state: ChessState;
  myColor: Player | null;
  interactive: boolean;
  onMove: (move: ChessMove) => void;
}

export function ChessBoard({ state, myColor, interactive, onMove }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const flipped = myColor === 'white';

  const board = useMemo(() => new Chess(state.fen).board(), [state.fen]);
  const legalMoves = useMemo(
    () => (interactive ? chessEngine.getLegalMoves(state) : []),
    [state, interactive],
  );
  const targets = useMemo(
    () => (selected ? legalMoves.filter((m) => m.from === selected) : []),
    [legalMoves, selected],
  );

  // 屏幕格 (col,row) → 棋盘格 (fileIdx, rank)
  const squareAt = (col: number, row: number): string => {
    const file = flipped ? 7 - col : col;
    const rank = flipped ? row + 1 : 8 - row;
    return 'abcdefgh'[file] + rank;
  };
  // 棋盘格 → 屏幕像素中心
  const center = (sq: string) => {
    const file = sq.charCodeAt(0) - 97;
    const rank = Number(sq[1]);
    const col = flipped ? 7 - file : file;
    const row = flipped ? rank - 1 : 8 - rank;
    return { cx: col * CELL + CELL / 2, cy: row * CELL + CELL / 2 };
  };

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#f0d9b5' : '#b58863';
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
      }
    }
    // 上一手高亮
    if (state.lastMove) {
      for (const sq of [state.lastMove.from, state.lastMove.to]) {
        const { cx, cy } = center(sq);
        ctx.fillStyle = 'rgba(205, 210, 60, 0.5)';
        ctx.fillRect(cx - CELL / 2, cy - CELL / 2, CELL, CELL);
      }
    }
    // 选中格
    if (selected) {
      const { cx, cy } = center(selected);
      ctx.fillStyle = 'rgba(230, 126, 34, 0.5)';
      ctx.fillRect(cx - CELL / 2, cy - CELL / 2, CELL, CELL);
    }
    // 可走目标
    for (const t of targets) {
      const { cx, cy } = center(t.to);
      const capture = board[8 - Number(t.to[1])][t.to.charCodeAt(0) - 97];
      ctx.beginPath();
      if (capture) {
        ctx.arc(cx, cy, CELL * 0.45, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(46, 160, 67, 0.8)';
        ctx.lineWidth = 4;
        ctx.stroke();
      } else {
        ctx.arc(cx, cy, CELL * 0.14, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(46, 160, 67, 0.6)';
        ctx.fill();
      }
    }
    // 棋子
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const piece = board[i][j];
        if (!piece) continue;
        const rank = 8 - i;
        const sq = 'abcdefgh'[j] + rank;
        const { cx, cy } = center(sq);
        ctx.font = `${CELL * 0.78}px serif`;
        ctx.fillStyle = piece.color === 'w' ? '#fff' : '#111';
        ctx.strokeStyle = piece.color === 'w' ? '#333' : '#000';
        ctx.lineWidth = 1;
        const glyph = GLYPHS[piece.color + piece.type];
        ctx.fillText(glyph, cx, cy + 2);
      }
    }
  }, [board, selected, targets, flipped, state.lastMove]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    const rect = ref.current!.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * SIZE;
    const my = ((e.clientY - rect.top) / rect.height) * SIZE;
    const col = Math.floor(mx / CELL);
    const row = Math.floor(my / CELL);
    if (col < 0 || row < 0 || col > 7 || row > 7) return;
    const sq = squareAt(col, row);

    if (selected && targets.some((t) => t.to === sq)) {
      onMove({ from: selected, to: sq });
      setSelected(null);
      return;
    }
    const piece = new Chess(state.fen).get(sq as any);
    // 框架 black=国际象棋白棋(先行);当前行棋方颜色映射
    const myChessColor = state.turn === 'black' ? 'w' : 'b';
    if (piece && piece.color === myChessColor) setSelected(sq);
    else setSelected(null);
  };

  return <canvas ref={ref} className="board-canvas" onClick={handleClick} />;
}
