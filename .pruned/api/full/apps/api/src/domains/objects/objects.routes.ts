import express from 'express';
import { createMulter } from './objects.utils.js';
import { deleteObjectController, uploadObjectController } from './objects.controller.js';

const router = express.Router({ mergeParams: true });
const upload = createMulter();

router.post('/:objectType/upload', upload.single('file'), uploadObjectController);

router.delete('/:objectType/delete', deleteObjectController);

export default router;
