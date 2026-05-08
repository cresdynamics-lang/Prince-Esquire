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
  const displayName = String(req.body.display_name ?? email.split("@")[0] ?? "").trim();

  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: "Email and password (min 6 chars) are required." });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const insertResult = await query(
      `INSERT INTO auth.users (email, password_hash, raw_user_meta_data) VALUES ($1, $2, $3) RETURNING id, email, raw_user_meta_data`,
      [email, passwordHash, JSON.stringify({ display_name: displayName })],
    );
    const user = insertResult.rows[0];
    await query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'customer')`, [user.id]);
    await query(`INSERT INTO public.profiles (user_id, display_name) VALUES ($1, $2)`, [user.id, displayName]);
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
  } catch (error: any) {
    if (error.code === "23505") {
      return res.status(400).json({ error: "A user already exists with that email." });
    }
    console.error('Signup error:', error);
    res.status(500).json({ error: error?.message ?? "Unable to create user." });
  }
}