export function resolveRedisUrl(): string | undefined {
  const isLocalStaging =
    process.argv.includes('--local:staging') ||
    process.env.LOCAL_STAGING === 'true';
  return isLocalStaging
    ? process.env.LOCAL_STAGING_REDIS_URL
    : process.env.REDIS_URL;
}

export function selectRedisDatabase(
  redisUrl: string,
  database: number,
): string {
  const url = new URL(redisUrl);
  url.pathname = `/${database}`;
  return url.toString();
}
