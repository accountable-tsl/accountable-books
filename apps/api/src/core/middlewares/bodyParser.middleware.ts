import express from 'express';

/** Default JSON body size for most API routes. */
export const DEFAULT_JSON_LIMIT = '1mb';

/** Limit for import/bulk endpoints that accept large payloads. */
export const LARGE_JSON_LIMIT = '20mb';

/** Path substrings for routes that use the large payload limit. */
const LARGE_PAYLOAD_PATH_MARKERS = [
  '/journals/import',
  '/bank-accounts/transactions/import',
];

function needsLargePayload(req: express.Request): boolean {
  if (req.method !== 'POST') return false;
  const path = req.path;
  return LARGE_PAYLOAD_PATH_MARKERS.some((marker) => path.includes(marker));
}

/** JSON body parser with a default limit and a higher limit for specific routes. */
export function conditionalJsonParser(): express.RequestHandler {
  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const limit = needsLargePayload(req)
      ? LARGE_JSON_LIMIT
      : DEFAULT_JSON_LIMIT;
    express.json({ limit })(req, res, next);
  };
}
