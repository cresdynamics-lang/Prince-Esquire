import { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import { query } from '../../../server/db';

const JWT_SECRET = process.env.JWT_SECRET ?? "local-postgres-secret";

function verifyToken(token: string) {
  return jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
}

function getBearerToken(req: NextApiRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.replace(/^Bearer\s+/, "");
}

async function fetchUserById(userId: string) {
  const { rows } = await query(
    `SELECT id, email, raw_user_meta_data FROM auth.users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0] as { id: string; email: string; raw_user_meta_data: any } | undefined;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.json({ data: { user: null }, error: null });
  }

  try {
    const payload = verifyToken(token);
    const user = await fetchUserById(payload.userId);
    if (!user) {
      return res.json({ data: { user: null }, error: null });
    }
    return res.json({ data: { user: { id: user.id, email: user.email } }, error: null });
  } catch (_error) {
    return res.json({ data: { user: null }, error: null });
  }
}