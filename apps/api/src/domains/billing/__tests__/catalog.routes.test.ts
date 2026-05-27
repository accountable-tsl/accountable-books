import { describe, expect, it } from 'vitest';

import router from '../catalog/catalog.routes.js';

describe('billing catalog routes', () => {
  it('registers GET / with getCatalog', () => {
    const routeLayer = (router as any).stack.find(
      (layer: any) => layer.route?.path === '/' && layer.route.methods?.get,
    );

    expect(routeLayer).toBeTruthy();

    const middlewareNames = routeLayer.route.stack.map(
      (layer: any) => layer.name,
    );

    expect(middlewareNames).toEqual(['getCatalog']);
  });
});
