import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

const storageRoot = path.resolve(process.cwd(), "server", "storage");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const bucket = req.query.bucket as string;
  const filePath = (req.query.path as string[]).join('/');

  try {
    const bucketPath = path.join(storageRoot, bucket);
    const fullPath = path.join(bucketPath, filePath);

    // Security check - ensure the file is within the bucket directory
    if (!fullPath.startsWith(bucketPath)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) {
      return res.status(404).json({ error: 'Not a file' });
    }

    // Set appropriate headers
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = getContentType(ext);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year

    // Stream the file
    const stream = fs.createReadStream(fullPath);
    stream.pipe(res);
  } catch (error: any) {
    console.error('File serving error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}

function getContentType(ext: string): string {
  const types: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.json': 'application/json',
  };
  return types[ext] || 'application/octet-stream';
}