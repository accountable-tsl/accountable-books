import express from 'express';

import { checkCompanyId } from '../../core/middlewares/companies.middleware.js';
import {
  getNotificationPreferencesController,
  getNotificationsController,
  getUnreadCounterController,
  markAllNotificationsReadController,
  markNotificationReadController,
  markNotificationsViewedController,
  setNotificationPreferenceController,
} from './notifications.controller.js';

const router = express.Router({ mergeParams: true });

router.use(checkCompanyId);

router.get('/notifications', getNotificationsController);
router.get('/notifications/unread-count', getUnreadCounterController);
router.get('/notifications/preferences', getNotificationPreferencesController);
router.put('/notifications/preferences', setNotificationPreferenceController);
router.post('/notifications/viewed', markNotificationsViewedController);
router.post('/notifications/mark-all-read', markAllNotificationsReadController);
router.post(
  '/notifications/:notificationId/read',
  markNotificationReadController,
);

export default router;
