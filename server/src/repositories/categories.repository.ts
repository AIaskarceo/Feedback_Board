import type { Category } from '@feedback-board/shared';
import { pool } from '../db/client';

interface CategoryRow {
  id: string;
  name: string;
  created_at: Date;
}

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listCategories(): Promise<Category[]> {
  const { rows } = await pool.query<CategoryRow>(
    `SELECT id, name, created_at FROM categories ORDER BY name ASC`
  );
  return rows.map(toCategory);
}

export async function getCategoryById(id: string): Promise<Category | null> {
  const { rows } = await pool.query<CategoryRow>(
    `SELECT id, name, created_at FROM categories WHERE id = $1`,
    [id]
  );
  return rows[0] ? toCategory(rows[0]) : null;
}

export class DuplicateCategoryNameError extends Error {}

export async function createCategory(name: string): Promise<Category> {
  try {
    const { rows } = await pool.query<CategoryRow>(
      `INSERT INTO categories (name) VALUES ($1) RETURNING id, name, created_at`,
      [name]
    );
    return toCategory(rows[0]);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') throw new DuplicateCategoryNameError();
    throw err;
  }
}
