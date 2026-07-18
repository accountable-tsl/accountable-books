import {
  createHash,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
} from 'node:crypto';
import type { Request } from 'express';
import type { JWKPublicKey } from 'plaid';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

import { ENV, isDev } from '../../../config/env.js';
import { logger } from '../../../shared/utils/logger.js';

const MAX_WEBHOOK_AGE_SECONDS = 5 * 60;
const CLOCK_SKEW_SECONDS = 30;
const VERIFICATION_KEY_CACHE_MS = 5 * 60 * 1000;

type GetVerificationKey = (keyId: string) => Promise<JWKPublicKey>;

const plaidClient = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[ENV.PLAID_ENV!],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': ENV.PLAID_CLIENT_ID,
        'PLAID-SECRET': ENV.PLAID_SECRET,
        'Plaid-Version': ENV.PLAID_VERSION || '2020-09-14',
      },
    },
  }),
);
const keyCache = new Map<string, { key: JWKPublicKey; fetchedAt: number }>();

async function fetchVerificationKey(keyId: string): Promise<JWKPublicKey> {
  const cached = keyCache.get(keyId);
  const now = Date.now();
  if (
    cached &&
    now - cached.fetchedAt < VERIFICATION_KEY_CACHE_MS &&
    (cached.key.expired_at === null || cached.key.expired_at > now / 1000)
  ) {
    return cached.key;
  }

  const response = await plaidClient.webhookVerificationKeyGet({
    key_id: keyId,
  });
  keyCache.set(keyId, { key: response.data.key, fetchedAt: now });
  return response.data.key;
}

function parseJwtPart(value: string): unknown {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function hashesMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export async function verifyPlaidWebhook({
  rawBody,
  signedJwt,
  getVerificationKey = fetchVerificationKey,
  now = new Date(),
}: {
  rawBody: Buffer;
  signedJwt: string | undefined;
  getVerificationKey?: GetVerificationKey;
  now?: Date;
}): Promise<boolean> {
  if (!signedJwt) return false;

  try {
    const parts = signedJwt.split('.');
    if (parts.length !== 3) return false;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = parseJwtPart(encodedHeader) as {
      alg?: unknown;
      kid?: unknown;
    };
    const payload = parseJwtPart(encodedPayload) as {
      iat?: unknown;
      request_body_sha256?: unknown;
    };
    if (
      header.alg !== 'ES256' ||
      typeof header.kid !== 'string' ||
      typeof payload.iat !== 'number' ||
      typeof payload.request_body_sha256 !== 'string'
    ) {
      return false;
    }

    const nowSeconds = now.getTime() / 1000;
    const ageSeconds = nowSeconds - payload.iat;
    if (
      ageSeconds < -CLOCK_SKEW_SECONDS ||
      ageSeconds > MAX_WEBHOOK_AGE_SECONDS
    ) {
      return false;
    }

    const key = await getVerificationKey(header.kid);
    if (
      key.kid !== header.kid ||
      key.alg !== 'ES256' ||
      key.kty !== 'EC' ||
      key.crv !== 'P-256' ||
      key.use !== 'sig' ||
      key.created_at > nowSeconds + CLOCK_SKEW_SECONDS ||
      (key.expired_at !== null && key.expired_at <= nowSeconds)
    ) {
      return false;
    }

    const publicKey = createPublicKey({
      key: {
        crv: key.crv,
        kty: key.kty,
        x: key.x,
        y: key.y,
      },
      format: 'jwk',
    });
    const signatureValid = verifySignature(
      'sha256',
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(encodedSignature, 'base64url'),
    );
    if (!signatureValid) return false;

    const bodyHash = createHash('sha256').update(rawBody).digest('hex');
    return hashesMatch(bodyHash, payload.request_body_sha256);
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Plaid webhook verification failed',
    );
    return false;
  }
}

export interface WebhookProviderConfig {
  verificationEnabled: boolean;
  verify: (req: Request) => Promise<boolean>;
}

export const webhookProviders: Record<string, WebhookProviderConfig> = {
  plaid: {
    verificationEnabled: !isDev || ENV.ENABLE_WEBHOOK_VERIFICATION === 'true',
    verify: (req: Request) =>
      verifyPlaidWebhook({
        rawBody: req.body as Buffer,
        signedJwt: req.headers['plaid-verification'] as string | undefined,
      }),
  },
};
