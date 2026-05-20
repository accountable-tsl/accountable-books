import express from 'express';

import { getCatalog } from './catalog.controller.js';

const router = express.Router({ mergeParams: true });

router.get('/', getCatalog);

export default router;
