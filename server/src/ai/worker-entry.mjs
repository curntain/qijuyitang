// Worker 入口(纯 JS):Worker 线程不继承主进程的 tsx 加载器,
// 这里先用 tsx/esm/api 程序化注册,再加载 TS 实现的计算逻辑

import { parentPort } from 'node:worker_threads';
import { register } from 'tsx/esm/api';

register();

const { handleTask } = await import('./worker.ts');

parentPort.on('message', (task) => {
  parentPort.postMessage(handleTask(task));
});
