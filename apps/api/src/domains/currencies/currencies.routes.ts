import express from 'express';

import { allCurrencies } from './currencies.controller.js';

const router = express.Router({ mergeParams: true });

router.get('/', allCurrencies);

export default router;
