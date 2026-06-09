import { z } from 'zod';

export const applyLoanSchema = z.object({
  principal: z
    .number()
    .min(10000, 'Minimum loan amount is KES 10,000')
    .max(50000, 'Maximum loan amount is KES 50,000'),
  term_days: z
    .number()
    .min(7, 'Minimum loan term is 7 days')
    .max(30, 'Maximum loan term is 30 days'),
});
