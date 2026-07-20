import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import type { JWKPublicKey } from 'plaid';
import { PlaidApi } from 'plaid';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { verifyPlaidWebhook } from '../webhookVerification.js';

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signedWebhook(body: Buffer, issuedAt: number, keyId = 'key-1') {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  });
  const header = encode({ alg: 'ES256', kid: keyId, typ: 'JWT' });
  const payload = encode({
    iat: issuedAt,
    request_body_sha256: createHash('sha256').update(body).digest('hex'),
  });
  const signingInput = `${header}.${payload}`;
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  const jwk = publicKey.export({ format: 'jwk' });
  if (!jwk.crv || !jwk.kty || !jwk.x || !jwk.y) {
    throw new Error('Generated key is not an EC public key');
  }

  const key: JWKPublicKey = {
    alg: 'ES256',
    crv: jwk.crv,
    created_at: issuedAt - 60,
    expired_at: null,
    kid: keyId,
    kty: jwk.kty,
    use: 'sig',
    x: jwk.x,
    y: jwk.y,
  };

  return {
    token: `${signingInput}.${signature}`,
    key,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Plaid webhook verification', () => {
  it('accepts a recent webhook signed by Plaid for the exact request body', async () => {
    const now = new Date('2026-07-18T12:00:00.000Z');
    const body = Buffer.from('{"webhook_type":"TRANSACTIONS"}');
    const webhook = signedWebhook(body, Math.floor(now.getTime() / 1000));
    const getVerificationKey = vi.fn().mockResolvedValue(webhook.key);

    await expect(
      verifyPlaidWebhook({
        rawBody: body,
        signedJwt: webhook.token,
        getVerificationKey,
        now,
      }),
    ).resolves.toBe(true);
    expect(getVerificationKey).toHaveBeenCalledWith('key-1');
  });

  it('rejects a valid signature when the request body has changed', async () => {
    const now = new Date('2026-07-18T12:00:00.000Z');
    const webhook = signedWebhook(
      Buffer.from('{"webhook_code":"SYNC_UPDATES_AVAILABLE"}'),
      Math.floor(now.getTime() / 1000),
    );

    await expect(
      verifyPlaidWebhook({
        rawBody: Buffer.from('{"webhook_code":"USER_PERMISSION_REVOKED"}'),
        signedJwt: webhook.token,
        getVerificationKey: async () => webhook.key,
        now,
      }),
    ).resolves.toBe(false);
  });

  it('rejects webhooks outside the allowed clock window', async () => {
    const now = new Date('2026-07-18T12:00:00.000Z');
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const body = Buffer.from('{}');
    const stale = signedWebhook(body, nowSeconds - 301);
    const future = signedWebhook(body, nowSeconds + 31);

    await expect(
      verifyPlaidWebhook({
        rawBody: body,
        signedJwt: stale.token,
        getVerificationKey: async () => stale.key,
        now,
      }),
    ).resolves.toBe(false);
    await expect(
      verifyPlaidWebhook({
        rawBody: body,
        signedJwt: future.token,
        getVerificationKey: async () => future.key,
        now,
      }),
    ).resolves.toBe(false);
  });

  it('rejects a signature that does not match Plaid’s public key', async () => {
    const now = new Date('2026-07-18T12:00:00.000Z');
    const body = Buffer.from('{}');
    const issuedAt = Math.floor(now.getTime() / 1000);
    const webhook = signedWebhook(body, issuedAt);
    const otherKey = signedWebhook(body, issuedAt).key;

    await expect(
      verifyPlaidWebhook({
        rawBody: body,
        signedJwt: webhook.token,
        getVerificationKey: async () => otherKey,
        now,
      }),
    ).resolves.toBe(false);
  });

  it('rejects unsafe algorithms and expired verification keys', async () => {
    const now = new Date('2026-07-18T12:00:00.000Z');
    const issuedAt = Math.floor(now.getTime() / 1000);
    const body = Buffer.from('{}');
    const webhook = signedWebhook(body, issuedAt);
    const [, payload, signature] = webhook.token.split('.');
    const getVerificationKey = vi.fn().mockResolvedValue(webhook.key);

    await expect(
      verifyPlaidWebhook({
        rawBody: body,
        signedJwt: `${encode({ alg: 'HS256', kid: 'key-1' })}.${payload}.${signature}`,
        getVerificationKey,
        now,
      }),
    ).resolves.toBe(false);
    expect(getVerificationKey).not.toHaveBeenCalled();

    await expect(
      verifyPlaidWebhook({
        rawBody: body,
        signedJwt: webhook.token,
        getVerificationKey: async () => ({
          ...webhook.key,
          expired_at: issuedAt - 1,
        }),
        now,
      }),
    ).resolves.toBe(false);
  });

  it('revalidates cached Plaid keys after five minutes', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-07-18T12:00:00.000Z');
    vi.setSystemTime(now);
    const body = Buffer.from('{}');
    const webhook = signedWebhook(
      body,
      Math.floor(now.getTime() / 1000),
      'cache-key',
    );
    const getVerificationKey = vi
      .spyOn(PlaidApi.prototype, 'webhookVerificationKeyGet')
      .mockResolvedValue({ data: { key: webhook.key } } as never);

    await verifyPlaidWebhook({
      rawBody: body,
      signedJwt: webhook.token,
      now,
    });
    await verifyPlaidWebhook({
      rawBody: body,
      signedJwt: webhook.token,
      now,
    });
    expect(getVerificationKey).toHaveBeenCalledTimes(1);

    vi.setSystemTime(now.getTime() + 5 * 60 * 1000 + 1);
    await verifyPlaidWebhook({
      rawBody: body,
      signedJwt: webhook.token,
      now,
    });
    expect(getVerificationKey).toHaveBeenCalledTimes(2);
  });
});
