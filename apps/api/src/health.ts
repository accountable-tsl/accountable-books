import express from 'express';

type HealthCheckStatus = 'ok' | 'fail';

interface HealthDependencies {
  checkPostgres: () => Promise<unknown>;
  checkRedis: () => Promise<unknown>;
}

let isReady = false;

export function markReady() {
  isReady = true;
}

export function markUnready() {
  isReady = false;
}

export function createHealthRouter({
  checkPostgres,
  checkRedis,
}: HealthDependencies) {
  const router = express.Router();

  router.get('/live', (_req, res) => {
    res.status(200).json({ status: 'alive' });
  });

  router.get('/ready', async (_req, res) => {
    if (!isReady) {
      return res
        .status(503)
        .json({ status: 'unavailable', checks: { startup: 'fail' } });
    }

    const [postgresResult, redisResult] = await Promise.allSettled([
      checkPostgres(),
      checkRedis(),
    ]);

    const checks: Record<'postgres' | 'redis', HealthCheckStatus> = {
      postgres: postgresResult.status === 'fulfilled' ? 'ok' : 'fail',
      redis: redisResult.status === 'fulfilled' ? 'ok' : 'fail',
    };

    const allPassing = Object.values(checks).every((value) => value === 'ok');

    return res.status(allPassing ? 200 : 503).json({
      status: allPassing ? 'ready' : 'unavailable',
      checks,
    });
  });

  return router;
}
