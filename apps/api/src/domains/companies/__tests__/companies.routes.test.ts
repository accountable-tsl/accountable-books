import { describe, expect, it } from 'vitest';

import router from '../companies.routes.js';

describe('companies routes', () => {
  it('protects PATCH /:companyId with access-token auth before company checks', () => {
    const patchLayer = (router as any).stack.find(
      (layer: any) =>
        layer.route?.path === '/:companyId' && layer.route.methods?.patch,
    );

    expect(patchLayer).toBeTruthy();

    const middlewareNames = patchLayer.route.stack.map(
      (layer: any) => layer.name,
    );

    expect(middlewareNames).toEqual([
      'verifyAccessToken',
      'checkCompanyId',
      'updateCompanyController',
    ]);
  });
});
