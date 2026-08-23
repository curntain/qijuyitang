// 端到端测试:注册登录 → 建房 → 加入 → 对战 → AI 局 → 战绩
import { io } from 'socket.io-client';

const BASE = 'http://localhost:3001';
const rnd = Math.random().toString(36).slice(2, 7);

async function register(name: string) {
  const res = await fetch(`${BASE}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: name, password: 'test123456' }),
  });
  if (!res.ok) throw new Error('注册失败 ' + (await res.text()));
  return (await res.json()) as { id: number; username: string };
}

function connect(cookie: string) {
  return new Promise<any>((resolve, reject) => {
    const s = io(BASE, { extraHeaders: { Cookie: cookie }, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

function emitAck(s: any, event: string, data: any): Promise<any> {
  return new Promise((resolve) => s.emit(event, data, resolve));
}

async function loginCookie(name: string): Promise<string> {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: name, password: 'test123456' }),
  });
  const setCookie = res.headers.get('set-cookie')!;
  return setCookie.split(';')[0];
}

async function main() {
  const u1 = await register(`甲${rnd}`);
  const u2 = await register(`乙${rnd}`);
  const c1 = await loginCookie(u1.username);
  const c2 = await loginCookie(u2.username);
  const s1 = await connect(c1);
  const s2 = await connect(c2);

  // 1. 创建真人房间(五子棋)
  const created = await emitAck(s1, 'room:create', { game: 'gomoku', vsAI: false });
  if (!created.ok) throw new Error('建房失败 ' + created.error);
  console.log('1. 建房成功:', created.room.id);

  // 2. 乙加入
  const joined = await emitAck(s2, 'room:join', { roomId: created.room.id });
  if (!joined.ok) throw new Error('加入失败 ' + joined.error);
  console.log('2. 加入成功,对局开始,轮到:', joined.room.state.turn);

  // 3. 双方交替落子几手
  const moves1 = [{x:7,y:7},{x:8,y:8},{x:7,y:8}];
  const moves2 = [{x:6,y:6},{x:9,y:9}];
  for (let i = 0; i < 3; i++) {
    const r1 = await emitAck(s1, 'game:move', { move: moves1[i] });
    if (r1.error) throw new Error('甲落子失败 ' + r1.error);
    if (i < 2) {
      const r2 = await emitAck(s2, 'game:move', { move: moves2[i] });
      if (r2.error) throw new Error('乙落子失败 ' + r2.error);
    }
  }
  // 非法着法校验:此时轮到乙,甲抢走应被拒
  const illegal = await emitAck(s1, 'game:move', { move: { x: 0, y: 0 } });
  console.log('3. 落子交互正常;抢落拦截:', illegal.error ? 'PASS' : 'FAIL');

  // 4. 乙认输 → 甲获胜 → 战绩写入
  await emitAck(s2, 'game:resign', {});
  await new Promise((r) => setTimeout(r, 300));
  const me1 = await (await fetch(`${BASE}/api/me`, { headers: { Cookie: c1 } })).json();
  const rec = me1.records.find((r: any) => r.game === 'gomoku');
  console.log('4. 认输判负与战绩:', rec && rec.wins === 1 ? 'PASS' : `FAIL ${JSON.stringify(rec)}`);

  // 5. AI 对局:人机五子棋,AI 应自动应答
  const aiRoom = await emitAck(s1, 'room:create', { game: 'gomoku', vsAI: true });
  if (!aiRoom.ok) throw new Error('AI 房创建失败');
  await emitAck(s1, 'game:move', { move: { x: 7, y: 7 } }); // 人类先手落子,AI 才应答
  const aiUpdate = await new Promise<any>((resolve) => {
    s1.on('game:update', resolve);
    setTimeout(() => resolve(null), 8000);
  });
  const aiMoved = aiUpdate && aiUpdate.state.moveCount >= 2;
  console.log('5. AI 自动应答:', aiMoved ? 'PASS' : 'FAIL');
  await emitAck(s1, 'room:leave', {});
  await new Promise((r) => setTimeout(r, 200));

  // 6. AI 象棋与围棋房也能创建并应答
  for (const game of ['chess', 'go', 'xiangqi']) {
    const r = await emitAck(s1, 'room:create', { game, vsAI: true });
    if (!r.ok) throw new Error(`${game} AI 房失败: ${r.error}`);
    const firstMoves: any = {
      chess: { from: 'e2', to: 'e4' },
      go: { x: 4, y: 4 },
      xiangqi: { from: { x: 1, y: 7 }, to: { x: 1, y: 5 } },
    };
    await emitAck(s1, 'game:move', { move: firstMoves[game] });
    const upd = await new Promise<any>((resolve) => {
      const h = (v: any) => { if (v.state.moveCount >= 2) resolve(v); };
      s1.on('game:update', h);
      setTimeout(() => resolve(null), 15000);
    });
    console.log(`6. ${game} AI 应答:`, upd ? 'PASS' : 'FAIL');
    await emitAck(s1, 'room:leave', {});
    await new Promise((r) => setTimeout(r, 200));
  }

  s1.disconnect(); s2.disconnect();
  console.log('E2E DONE');
  process.exit(0);
}
main().catch((e) => { console.error('E2E FAIL:', e.message); process.exit(1); });
