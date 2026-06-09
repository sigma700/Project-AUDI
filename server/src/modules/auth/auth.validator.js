import { z } from 'zod';

export const requestOtpSchema = z.object({
  phone: z
    .string()
    .min(10)
    .max(15)
    .regex(/^(\+254|0)[17]\d{8}$/, 'Invalid Kenyan phone number'),
});

export const verifyOtpSchema = z.object({
  phone: z
    .string()
    .min(10)
    .max(15)
    .regex(/^(\+254|0)[17]\d{8}$/, 'Invalid Kenyan phone number'),
  otp: z
    .string()
    .length(6)
    .regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});
