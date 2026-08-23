// AI 调度池:限制并发 Worker 数(2C2G 共享机器),超出排队

import { Worker } from 'node:worker_threads';
import type { GameId } from '@qi/shared';

const MAX_CONCURRENT = 2;
export const DEFAULT_TIME_BUDGET = 1500; // 每步 AI 时间预算(毫秒)

let running = 0;
const queue: Array<() => void> = [];

export function computeAIMove(
  gameId: GameId,
  state: unknown,
  timeBudget = DEFAULT_TIME_BUDGET,
): Promise<unknown> {
  return new Promise((resolve) => {
    const run = () => {
      running++;
      let settled = false;
      const finish = (val: unknown) => {
        if (settled) return;
        settled = true;
        running--;
        const next = queue.shift();
        if (next) next();
        resolve(val);
      };

      // worker-entry.mjs 内部会自行注册 tsx 加载器再加载 TS 逻辑
      const worker = new Worker(new URL('./worker-entry.mjs', import.meta.url));
      worker.once('message', (move) => {
        worker.terminate();
        finish(move);
      });
      worker.once('error', () => finish(null));
      // 兜底:超出预算 3 秒仍未返回则强制终止
      setTimeout(() => {
        if (!settled) {
          worker.terminate();
          finish(null);
        }
      }, timeBudget + 3000);

      worker.postMessage({ gameId, state, timeBudget });
    };

    if (running < MAX_CONCURRENT) run();
    else queue.push(run);
  });
}
