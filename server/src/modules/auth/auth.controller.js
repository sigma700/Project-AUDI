import { requestOtpSchema, verifyOtpSchema } from './auth.validator.js';
import {
  createOtp,
  verifyOtp,
  findOrCreateUser,
  generateAccessToken,
  generateRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from './auth.service.js';
import { AppError } from '../../shared/errors/AppError.js';
import env from '../../config/env.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: env.JWT_REFRESH_TTL * 1000,
};

export async function requestOtp(req, res) {
  const { phone } = requestOtpSchema.parse(req.body);

  const otp = await createOtp(phone);

  // In development log the OTP — in production send via SMS
  if (env.NODE_ENV === 'development') {
    console.log(`[DEV] OTP for ${phone}: ${otp}`);
  } else {
    // TODO: plug in Africa's Talking SMS here in Day 5
  }

  res.json({
    status: 'success',
    message: 'OTP sent successfully',
    ...(env.NODE_ENV === 'development' && { otp }),
  });
}

export async function verifyOtpHandler(req, res) {
  const { phone, otp } = verifyOtpSchema.parse(req.body);

  const result = await verifyOtp(phone, otp);

  if (!result.success) {
    throw new AppError(result.message, 400);
  }

  const user = await findOrCreateUser(phone);

  if (user.status === 'suspended' || user.status === 'blacklisted') {
    throw new AppError('Account is not active. Contact support.', 403);
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

  res.json({
    status: 'success',
    message: 'Login successful',
    data: {
      accessToken,
      user: {
        id: user.id,
        phone: user.phone,
        status: user.status,
        kyc_status: user.kyc_status,
        first_name: user.first_name,
        last_name: user.last_name,
      },
    },
  });
}

export async function refresh(req, res) {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;

  if (!token) {
    throw new AppError('Refresh token required', 401);
  }

  const result = await rotateRefreshToken(token);

  if (!result.success) {
    throw new AppError(result.message, 401);
  }

  res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);

  res.json({
    status: 'success',
    data: { accessToken: result.accessToken },
  });
}

export async function logout(req, res) {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;

  if (token) {
    await revokeRefreshToken(token);
  }

  res.clearCookie('refreshToken');

  res.json({
    status: 'success',
    message: 'Logged out successfully',
  });
}
