import { Router } from 'express';

import catalogRoutes from './catalog/catalog.routes.js';

const router = Router({ mergeParams: true });

router.use('/catalog', catalogRoutes);

export default router;
