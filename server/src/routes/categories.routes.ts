import { Router } from 'express';
import type { ApiResponse, Category } from '@feedback-board/shared';
import { createCategory, DuplicateCategoryNameError, listCategories } from '../repositories/categories.repository';
import { requireAuth } from '../middleware/requireAuth';
import { requireApproved } from '../middleware/requireApproved';
import { requireTeamLeadOrAdmin } from '../middleware/requireRole';

export const categoriesRouter = Router();

categoriesRouter.use(requireAuth, requireApproved);

const MAX_CATEGORY_NAME_LENGTH = 100;

categoriesRouter.get('/', async (_req, res, next) => {
  try {
    const categories = await listCategories();
    res.json({ data: categories } satisfies ApiResponse<Category[]>);
  } catch (err) {
    next(err);
  }
});

categoriesRouter.post('/', requireTeamLeadOrAdmin, async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > MAX_CATEGORY_NAME_LENGTH) {
      res
        .status(400)
        .json({ error: 'Category name is required and must be 100 characters or fewer.' } satisfies ApiResponse<never>);
      return;
    }
    const category = await createCategory(name);
    res.status(201).json({ data: category } satisfies ApiResponse<Category>);
  } catch (err) {
    if (err instanceof DuplicateCategoryNameError) {
      res
        .status(400)
        .json({ error: 'A category with this name already exists.' } satisfies ApiResponse<never>);
      return;
    }
    next(err);
  }
});
