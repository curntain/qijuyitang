// JWT 令牌:签发与校验

import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'qi-dev-secret-change-in-production';
const EXPIRES = '7d';
export const COOKIE_NAME = 'qi_token';

export interface TokenPayload {
  uid: number;
  username: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, SECRET) as TokenPayload;
    if (!decoded || typeof decoded.uid !== 'number') return null;
    return { uid: decoded.uid, username: decoded.username };
  } catch {
    return null;
  }
}
