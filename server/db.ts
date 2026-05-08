import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

// Support both individual DB_* vars (local dev) and DATABASE_URL (Vercel Postgres)
let pool: Pool;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });
} else {
  pool = new Pool({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? "postgres",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "prince_esquare",
    max: 10,
  });
}

export type ForeignKey = {
  source_table: string;
  source_columns: string[];
  target_table: string;
  target_columns: string[];
};

let foreignKeysCache: ForeignKey[] | null = null;

export async function query(text: string, params: unknown[] = []) {
  return pool.query(text, params);
}

export async function getForeignKeys(): Promise<ForeignKey[]> {
  if (foreignKeysCache) return foreignKeysCache;

  const result = await query(`
    SELECT
      source.relname AS source_table,
      array_agg(att2.attname ORDER BY source_cols.ord) AS source_columns,
      target.relname AS target_table,
      array_agg(att.attname ORDER BY target_cols.ord) AS target_columns
    FROM pg_constraint c
    JOIN pg_class source ON source.oid = c.conrelid
    JOIN pg_class target ON target.oid = c.confrelid
    JOIN unnest(c.conkey) WITH ORDINALITY AS source_cols(attnum, ord) ON true
    JOIN unnest(c.confkey) WITH ORDINALITY AS target_cols(attnum, ord) ON source_cols.ord = target_cols.ord
    JOIN pg_attribute att2 ON att2.attrelid = source.oid AND att2.attnum = source_cols.attnum
    JOIN pg_attribute att ON att.attrelid = target.oid AND att.attnum = target_cols.attnum
    WHERE c.contype = 'f'
    GROUP BY source.relname, target.relname;
  `);

  foreignKeysCache = result.rows.map((row) => ({
    source_table: row.source_table,
    source_columns: Array.isArray(row.source_columns) ? row.source_columns : row.source_columns.slice(1, -1).split(','),
    target_table: row.target_table,
    target_columns: Array.isArray(row.target_columns) ? row.target_columns : row.target_columns.slice(1, -1).split(','),
  }));
  return foreignKeysCache;
}

export function quoteIdentifier(identifier: string) {
  if (!/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(identifier)) {
    throw new Error(`Invalid identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}
