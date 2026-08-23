// Electron 桌面封装入口
// 启动时以内置子进程方式拉起 Node 服务端(Express + Socket.IO),
// 然后用浏览器窗口加载前端页面。业务代码零改动。

const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = Number(process.env.QI_PORT || 3001);
// 打包后本文件位于 resources/app/electron-main.js;开发时位于 server/
const APP_DIR = __dirname;

let serverProc = null;
let mainWindow = null;

function startServer() {
  serverProc = spawn(
    process.execPath,
    ['--import', 'tsx', path.join('src', 'index.ts')],
    {
      cwd: APP_DIR,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        PORT: String(PORT),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  serverProc.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  serverProc.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  serverProc.on('exit', (code) => {
    if (!app.quitting) {
      dialog.showErrorBox(
        '服务已停止',
        `内置服务进程异常退出(退出码 ${code}),应用即将关闭。`,
      );
      app.quit();
    }
  });
}

function waitReady(timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`http://127.0.0.1:${PORT}/api/me`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('内置服务启动超时'));
        } else {
          setTimeout(tick, 300);
        }
      });
      req.setTimeout(1500, () => req.destroy());
    };
    tick();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 380,
    minHeight: 640,
    title: '棋聚一堂',
    backgroundColor: '#14161c',
    webPreferences: { contextIsolation: true },
  });
  mainWindow.loadURL(`http://127.0.0.1:${PORT}/`);
  // 新窗口链接交给系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    startServer();
    try {
      await waitReady();
    } catch (e) {
      dialog.showErrorBox(
        '启动失败',
        `端口 ${PORT} 可能被占用或服务启动超时,请关闭占用该端口的程序后重试。\n${e.message}`,
      );
      app.quit();
      return;
    }
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    app.quitting = true;
    if (serverProc) serverProc.kill();
  });
}
