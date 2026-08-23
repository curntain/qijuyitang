// SQLite 数据层:用户与战绩

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(import.meta.dirname, '../data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'game.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS records (
  user_id INTEGER NOT NULL,
  game TEXT NOT NULL,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, game)
);
`);

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
}

export interface RecordRow {
  game: string;
  wins: number;
  losses: number;
  draws: number;
}

const stmts = {
  insertUser: db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)'),
  findUser: db.prepare('SELECT * FROM users WHERE username = ?'),
  userById: db.prepare('SELECT id, username, created_at FROM users WHERE id = ?'),
  upsertRecord: db.prepare(`
    INSERT INTO records (user_id, game) VALUES (?, ?)
    ON CONFLICT(user_id, game) DO NOTHING
  `),
  addWin: db.prepare('UPDATE records SET wins = wins + 1 WHERE user_id = ? AND game = ?'),
  addLoss: db.prepare('UPDATE records SET losses = losses + 1 WHERE user_id = ? AND game = ?'),
  addDraw: db.prepare('UPDATE records SET draws = draws + 1 WHERE user_id = ? AND game = ?'),
  records: db.prepare('SELECT game, wins, losses, draws FROM records WHERE user_id = ?'),
};

export function createUser(username: string, passwordHash: string): number {
  return Number(stmts.insertUser.run(username, passwordHash).lastInsertRowid);
}

export function findUser(username: string): UserRow | undefined {
  return stmts.findUser.get(username) as UserRow | undefined;
}

export function userById(id: number) {
  return stmts.userById.get(id) as { id: number; username: string; created_at: string } | undefined;
}

/** result: 对该用户而言是赢、输还是平 */
export function recordResult(userId: number, game: string, result: 'win' | 'loss' | 'draw'): void {
  stmts.upsertRecord.run(userId, game);
  if (result === 'win') stmts.addWin.run(userId, game);
  else if (result === 'loss') stmts.addLoss.run(userId, game);
  else stmts.addDraw.run(userId, game);
}

export function userRecords(userId: number): RecordRow[] {
  return stmts.records.all(userId) as RecordRow[];
}
