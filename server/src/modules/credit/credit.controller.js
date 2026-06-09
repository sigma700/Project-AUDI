import { evaluateUserCredit, getCreditProfile } from './credit.service.js';

export async function getProfile(req, res) {
  const profile = await getCreditProfile(req.user.sub);

  res.json({
    status: 'success',
    data: { credit: profile },
  });
}

export async function evaluate(req, res) {
  const result = await evaluateUserCredit(req.user.sub);

  res.json({
    status: 'success',
    message: 'Credit profile evaluated successfully',
    data: result,
  });
}
