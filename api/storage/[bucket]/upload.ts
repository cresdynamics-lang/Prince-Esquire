import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import formidable from 'formidable';

export const config = {
  api: {
    bodyParser: false,
  },
};

const storageRoot = path.resolve(process.cwd(), "server", "storage");

function ensureBucket(bucket: string) {
  const bucketPath = path.join(storageRoot, bucket);
  fs.mkdirSync(bucketPath, { recursive: true });
  return bucketPath;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const bucket = req.query.bucket as string;

  const form = formidable({
    multiples: false,
    keepExtensions: true,
  });

  try {
    const [fields, files] = await form.parse(req);
    const file = files.file?.[0];
    const uploadPath = String(fields.path?.[0] ?? "").replace(/^\/+/, "");

    if (!file || !uploadPath) {
      return res.status(400).json({ error: "Missing file or path." });
    }

    const bucketPath = ensureBucket(bucket);
    const fullPath = path.join(bucketPath, uploadPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });

    // Move file from temp location to final destination
    fs.renameSync(file.filepath, fullPath);

    return res.json({
      data: {
        publicUrl: `/api/storage/${encodeURIComponent(bucket)}/public/${encodeURIComponent(uploadPath)}`
      }
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: error?.message ?? "Upload failed." });
  }
}