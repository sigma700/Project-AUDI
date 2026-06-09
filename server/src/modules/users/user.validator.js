import { z } from 'zod';

export const updateProfileSchema = z
  .object({
    first_name: z.string().min(2).max(100).optional(),
    last_name: z.string().min(2).max(100).optional(),
    email: z.string().email().optional(),
    date_of_birth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' });
