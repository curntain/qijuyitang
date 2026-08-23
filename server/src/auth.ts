// HTTP 认证接口:注册、登录、登出、个人信息与战绩

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createUser, findUser, userById, userRecords } from './db.js';
import { COOKIE_NAME, signToken, verifyToken } from './token.js';

export const authRouter = Router();

const USERNAME_RE = /^[\u4e00-\u9fa5a-zA-Z0-9_]{2,16}$/;

authRouter.post('/register', (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: '用户名需为 2-16 位中英文、数字或下划线' });
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 64) {
    return res.status(400).json({ error: '密码长度需在 6-64 位之间' });
  }
  if (findUser(username)) {
    return res.status(409).json({ error: '用户名已被注册' });
  }
  const id = createUser(username, bcrypt.hashSync(password, 10));
  const token = signToken({ uid: id, username });
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${7 * 86400}; SameSite=Lax`);
  res.json({ id, username });
});

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }
  const user = findUser(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = signToken({ uid: user.id, username: user.username });
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${7 * 86400}; SameSite=Lax`);
  res.json({ id: user.id, username: user.username });
});

authRouter.post('/logout', (_req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  const user = currentUser(req.headers.cookie);
  if (!user) return res.status(401).json({ error: '未登录' });
  return res.json({ ...user, records: userRecords(user.id) });
});

/** 从 Cookie 头解析当前用户,供 Socket.IO 握手复用 */
export function currentUser(cookieHeader: string | undefined): { id: number; username: string } | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const name = pair.slice(0, idx).trim();
    if (name === COOKIE_NAME) {
      const payload = verifyToken(pair.slice(idx + 1).trim());
      if (!payload) return null;
      const row = userById(payload.uid);
      if (!row) return null;
      return { id: row.id, username: row.username };
    }
  }
  return null;
}
