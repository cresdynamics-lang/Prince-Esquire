import { NextApiRequest, NextApiResponse } from 'next';
import { query } from '../../server/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { table, op, select = '*', filters = [], order, range, limit, data, upsertKeys, returning, singleMode } = req.body;

    let sql = '';
    const params: any[] = [];
    let paramIndex = 1;

    // Build WHERE clause
    const whereConditions: string[] = [];
    filters.forEach((filter: any) => {
      if (filter.type === 'eq') {
        whereConditions.push(`${filter.column} = $${paramIndex}`);
        params.push(filter.value);
        paramIndex++;
      } else if (filter.type === 'in') {
        const placeholders = filter.values.map(() => `$${paramIndex++}`).join(',');
        whereConditions.push(`${filter.column} IN (${placeholders})`);
        params.push(...filter.values);
      }
    });
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Build ORDER BY clause
    const orderClause = order ? `ORDER BY ${order.column} ${order.ascending ? 'ASC' : 'DESC'}` : '';

    // Build LIMIT/OFFSET clause
    let limitClause = '';
    if (range) {
      limitClause = `LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(range.to - range.from + 1, range.from);
      paramIndex += 2;
    } else if (limit) {
      limitClause = `LIMIT $${paramIndex}`;
      params.push(limit);
      paramIndex++;
    }

    if (op === 'select') {
      sql = `SELECT ${select} FROM ${table} ${whereClause} ${orderClause} ${limitClause}`;
    } else if (op === 'insert') {
      const columns = Object.keys(data);
      const values = Object.values(data);
      const placeholders = columns.map(() => `$${paramIndex++}`).join(',');
      sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`;
      if (returning) {
        sql += ` RETURNING ${returning}`;
      }
      params.push(...values);
    } else if (op === 'update') {
      const setParts = Object.keys(data).map(key => `${key} = $${paramIndex++}`);
      sql = `UPDATE ${table} SET ${setParts.join(', ')} ${whereClause}`;
      params.push(...Object.values(data));
      if (returning) {
        sql += ` RETURNING ${returning}`;
      }
    } else if (op === 'delete') {
      sql = `DELETE FROM ${table} ${whereClause}`;
      if (returning) {
        sql += ` RETURNING ${returning}`;
      }
    } else if (op === 'upsert') {
      const columns = Object.keys(data);
      const values = Object.values(data);
      const setParts = columns.map(key => `${key} = EXCLUDED.${key}`);
      const placeholders = columns.map(() => `$${paramIndex++}`).join(',');
      const conflictColumns = Array.isArray(upsertKeys) ? upsertKeys.join(',') : upsertKeys;
      sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders}) ON CONFLICT (${conflictColumns}) DO UPDATE SET ${setParts.join(', ')}`;
      params.push(...values);
      if (returning) {
        sql += ` RETURNING ${returning}`;
      }
    }

    const result = await query(sql, params);

    let responseData = result.rows;
    if (singleMode === 'single') {
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Not found' });
      }
      responseData = result.rows[0];
    } else if (singleMode === 'maybe') {
      responseData = result.rows.length > 0 ? result.rows[0] : null;
    }

    res.status(200).json({ data: responseData });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Database error' });
  }
}