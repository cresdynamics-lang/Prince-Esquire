import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

const storageRoot = path.resolve(process.cwd(), "server", "storage");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const bucket = req.query.bucket as string;
  const paths = Array.isArray(req.body.paths) ? req.body.paths : [req.body.path];

  if (!paths.length) {
    return res.status(400).json({ error: "Missing path(s) to remove." });
  }

  try {
    const bucketPath = path.join(storageRoot, bucket);
    for (const relativePath of paths) {
      const safePath = String(relativePath).replace(/^\/+/, "");
      const fullPath = path.join(bucketPath, safePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }
    return res.json({ data: { ok: true } });
  } catch (error: any) {
    console.error('Remove error:', error);
    return res.status(500).json({ error: error?.message ?? "Remove failed." });
  }
}