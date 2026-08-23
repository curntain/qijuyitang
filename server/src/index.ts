// 服务入口:Express(HTTP API + 前端静态托管)+ Socket.IO(实时对局)

import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { Server } from 'socket.io';
import { authRouter, currentUser } from './auth.js';
import { setupRooms } from './rooms.js';

const app = express();
app.use(express.json());
app.use('/api', authRouter);

// 生产模式:托管前端构建产物(client/dist)
const distDir = path.resolve(import.meta.dirname, '../../client/dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
});

// 握手鉴权:从 Cookie 读取 JWT
io.use((socket, next) => {
  socket.data.user = currentUser(socket.handshake.headers.cookie);
  next();
});

setupRooms(io);

const port = Number(process.env.PORT || 3001);
server.listen(port, () => {
  console.log(`[qi] server listening on http://localhost:${port}`);
});
