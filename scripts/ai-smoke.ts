import { engines } from '@qi/shared';
import { computeAIMove } from '../server/src/ai/pool.js';

async function main() {
  for (const gameId of ['gomoku', 'chess', 'xiangqi', 'go'] as const) {
    const state = engines[gameId].initialState(gameId === 'go' ? { size: 9 } : {});
    const t0 = Date.now();
    const move = await computeAIMove(gameId, state, 1500);
    console.log(gameId, '→', JSON.stringify(move), `(${Date.now() - t0}ms)`);
    if (move == null) throw new Error(gameId + ' AI 无着法');
    if (!engines[gameId].isLegalMove(state, move)) throw new Error(gameId + ' AI 着法非法');
  }
  // 再测中盘局面
  let go = engines.go.initialState({ size: 9 });
  go = engines.go.applyMove(go, { x: 4, y: 4 });
  go = engines.go.applyMove(go, { x: 2, y: 2 });
  const t0 = Date.now();
  const m = await computeAIMove('go', go, 1500);
  console.log('go 中盘 →', JSON.stringify(m), `(${Date.now() - t0}ms)`);
  console.log('ALL AI OK');
  process.exit(0);
}
main().catch((e) => { console.error('FAIL', e); process.exit(1); });
