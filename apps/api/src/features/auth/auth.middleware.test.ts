import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { redis } from '../../lib/redis.js';
import { verifySessionToken } from './auth.middleware.js';
import { JWT_CONFIG } from './auth.utils.js';

vi.mock('../../lib/redis.js', () => ({
  redis: {
    sismember: vi.fn(),
  },
}));

function makeResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe('verifySessionToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts a valid access token without checking redis', async () => {
    const accessToken = jwt.sign(
      { sub: 'user-access-1' },
      JWT_CONFIG.accessToken.secret,
      { expiresIn: '1h' },
    );

    const req = {
      cookies: { accessToken },
      user: {},
    } as any;
    const res = makeResponse();
    const next = vi.fn();

    await verifySessionToken(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.id).toBe('user-access-1');
    expect(vi.mocked(redis.sismember)).not.toHaveBeenCalled();
  });

  it('falls back to an active refresh token when the access token is expired', async () => {
    const expiredAccessToken = jwt.sign(
      { sub: 'user-refresh-1' },
      JWT_CONFIG.accessToken.secret,
      { expiresIn: '-1s' },
    );
    const refreshToken = jwt.sign(
      { sub: 'user-refresh-1' },
      JWT_CONFIG.refreshToken.secret,
      { expiresIn: '1h' },
    );

    vi.mocked(redis.sismember).mockResolvedValue(1 as any);

    const req = {
      cookies: { accessToken: expiredAccessToken, refreshToken },
      user: {},
    } as any;
    const res = makeResponse();
    const next = vi.fn();

    await verifySessionToken(req, res as any, next);

    expect(redis.sismember).toHaveBeenCalledWith(
      'refreshTokens:user-refresh-1',
      refreshToken,
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.id).toBe('user-refresh-1');
  });

  it('rejects a revoked refresh session during fallback', async () => {
    const expiredAccessToken = jwt.sign(
      { sub: 'user-refresh-2' },
      JWT_CONFIG.accessToken.secret,
      { expiresIn: '-1s' },
    );
    const refreshToken = jwt.sign(
      { sub: 'user-refresh-2' },
      JWT_CONFIG.refreshToken.secret,
      { expiresIn: '1h' },
    );

    vi.mocked(redis.sismember).mockResolvedValue(0 as any);

    const req = {
      cookies: { accessToken: expiredAccessToken, refreshToken },
      user: {},
    } as any;
    const res = makeResponse();
    const next = vi.fn();

    await verifySessionToken(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalled();
  });
});
