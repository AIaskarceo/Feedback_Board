import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool, type QueryResult, type QueryResultRow } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set.');
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

// Postgres error codes for "already exists", so re-running schema.sql is a no-op.
const ALREADY_EXISTS_CODES = new Set([
  '42P07', // duplicate_table
  '42710', // duplicate_object (extension, constraint, etc.)
  '42P16', // invalid_table_definition (duplicate column/constraint in some paths)
]);

export async function runMigration(): Promise<void> {
  const schemaPath = join(__dirname, '..', '..', 'db', 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  const statements = schema
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    try {
      await pool.query(statement);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (!code || !ALREADY_EXISTS_CODES.has(code)) {
        throw error;
      }
    }
  }
}
