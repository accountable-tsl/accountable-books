import express from 'express';
import { getCountryList } from './countries.controller.js';

const router = express.Router({ mergeParams: true });

router.get('/', getCountryList);

export default router;
