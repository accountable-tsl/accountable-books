import express from 'express';

import { accountMetaController } from './account.controller.js';

const router = express.Router({ mergeParams: true });

router.get('/', accountMetaController);

export default router;
