// AI 计算逻辑:由 worker-entry.mjs 在独立线程加载执行
// 低资源策略:带时间预算,超时返回当前最优着

import { computeGomokuMove } from './games/gomoku.js';
import { computeChessMove } from './games/chess.js';
import { computeXiangqiMove } from './games/xiangqi.js';
import { computeGoMove } from './games/go.js';

interface Task {
  gameId: string;
  state: any;
  timeBudget: number;
}

export function handleTask(task: Task): unknown {
  const deadline = Date.now() + task.timeBudget;
  try {
    switch (task.gameId) {
      case 'gomoku':
        return computeGomokuMove(task.state);
      case 'chess':
        return computeChessMove(task.state);
      case 'xiangqi':
        return computeXiangqiMove(task.state, deadline);
      case 'go':
        return computeGoMove(task.state, deadline);
      default:
        return null;
    }
  } catch {
    return null;
  }
}
