/**
 * Central registry of ML Engine endpoints.
 * Keeps paths/methods in one place as the surface area grows.
 */
export const ML_ROUTES = {
  predict: { method: 'POST', path: '/api/v1/predict' },
  health: { method: 'GET', path: '/health' },
} as const;
