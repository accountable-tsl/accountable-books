import { describe, expect, it } from 'vitest';

import router from '../billing.routes.js';
import catalogRoutes from '../catalog/catalog.routes.js';

describe('billing routes', () => {
  it('mounts the catalog router at /catalog', () => {
    const catalogLayer = (router as any).stack.find(
      (layer: any) => layer.handle === catalogRoutes,
    );

    expect(catalogLayer).toBeTruthy();
  });
});
