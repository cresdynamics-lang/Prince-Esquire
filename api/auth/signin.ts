import { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../../../server/db';

const JWT_SECRET = process.env.JWT_SECRET ?? "local-postgres-secret";
const JWT_EXPIRES_IN = "7d";

function createToken(payload: { userId: string; email: string }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = String(req.body.email ?? "").trim().toLowerCase();
  const password = String(req.body.password ?? "");

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const { rows } = await query(
      `SELECT id, email, password_hash, raw_user_meta_data FROM auth.users WHERE email = $1 LIMIT 1`,
      [email],
    );
    const user = rows[0];
    if (!user) {
      return res.status(400).json({ error: "Invalid email or password." });
    }

    const match = await bcrypt.compare(password, user.password_hash || "");
    if (!match) {
      return res.status(400).json({ error: "Invalid email or password." });
    }

    const token = createToken({ userId: user.id, email: user.email });
    return res.json({
      data: {
        user: { id: user.id, email: user.email },
        session: {
          access_token: token,
          user: { id: user.id, email: user.email },
          token_type: "bearer"
        }
      }
    });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}