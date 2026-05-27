import express from 'express';

import { getBankFeedProvidersController } from './bankFeedProviders.controller.js';

const router = express.Router({ mergeParams: true });

router.get('/', getBankFeedProvidersController);

export default router;
