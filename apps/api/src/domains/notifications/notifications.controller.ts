import type { Response } from 'express';
import { z } from 'zod';

import {
  errorResponse,
  successResponse,
} from '../../shared/utils/response.utils.js';
import {
  listNotificationPreferences,
  setNotificationPreference,
  SUPPORTED_NOTIFICATION_PREFERENCE_CHANNELS,
  SUPPORTED_NOTIFICATION_PREFERENCE_DELIVERY_MODES,
} from './notification-preferences.js';
import {
  getNotificationFeed,
  getUnreadCounter,
  markAllNotificationsRead,
  markNotificationsRead,
  markNotificationsViewed,
} from './notifications.model.js';
import { notificationTypeSchema } from './notifications.types.js';

import type { AuthRequest } from '../../features/auth/auth.types.js';

const idsBodySchema = z.object({
  notificationIds: z.array(z.uuid()).max(200),
});

const preferenceBodySchema = z
  .object({
    notificationType: notificationTypeSchema,
    channel: z.enum(SUPPORTED_NOTIFICATION_PREFERENCE_CHANNELS),
    deliveryMode: z.enum(SUPPORTED_NOTIFICATION_PREFERENCE_DELIVERY_MODES),
  })
  .strict();

function getRequestUserId(req: AuthRequest): string {
  const userId = req.user?.id;
  if (!userId) {
    throw new Error('Authenticated user is required');
  }
  return userId;
}

function getRequestCompanyId(req: AuthRequest): string {
  const companyId = req.companyContext?.uuid;
  if (!companyId) {
    throw new Error('Authenticated company context is required');
  }
  return companyId;
}

function parseLimit(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return undefined;
  return parsed;
}

function parseBefore(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value.trim();
}

export async function getNotificationsController(
  req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const feed = await getNotificationFeed({
      recipientUserId: getRequestUserId(req),
      companyId: getRequestCompanyId(req),
      limit: parseLimit(req.query.limit),
      before: parseBefore(req.query.before),
      unreadOnly: req.query.unreadOnly === 'true',
    });

    return res
      .status(200)
      .json(successResponse('Notifications retrieved', feed));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message === 'Authenticated user is required' ||
      message === 'Authenticated company context is required'
    ) {
      return res.status(401).json(errorResponse(message));
    }

    return res
      .status(500)
      .json(errorResponse('Failed to retrieve notifications', error));
  }
}

export async function getUnreadCounterController(
  req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const counter = await getUnreadCounter({
      userId: getRequestUserId(req),
      companyId: getRequestCompanyId(req),
    });
    return res
      .status(200)
      .json(successResponse('Notification unread count retrieved', counter));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message === 'Authenticated user is required' ||
      message === 'Authenticated company context is required'
    ) {
      return res.status(401).json(errorResponse(message));
    }

    return res
      .status(500)
      .json(
        errorResponse('Failed to retrieve notification unread count', error),
      );
  }
}

export async function getNotificationPreferencesController(
  req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const preferences = await listNotificationPreferences({
      userId: getRequestUserId(req),
    });

    return res.status(200).json(
      successResponse('Notification preferences retrieved', {
        items: preferences,
        supportedChannels: [...SUPPORTED_NOTIFICATION_PREFERENCE_CHANNELS],
        supportedDeliveryModes: [
          ...SUPPORTED_NOTIFICATION_PREFERENCE_DELIVERY_MODES,
        ],
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'Authenticated user is required') {
      return res.status(401).json(errorResponse(message));
    }

    return res
      .status(500)
      .json(errorResponse('Failed to retrieve notification preferences', error));
  }
}

export async function setNotificationPreferenceController(
  req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const body = preferenceBodySchema.parse(req.body);
    const preference = await setNotificationPreference({
      userId: getRequestUserId(req),
      notificationType: body.notificationType,
      channel: body.channel,
      deliveryMode: body.deliveryMode,
    });

    return res
      .status(200)
      .json(successResponse('Notification preference updated', preference));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json(errorResponse('Invalid notification preference', error));
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message === 'Authenticated user is required') {
      return res.status(401).json(errorResponse(message));
    }

    if (message.startsWith('Unsupported notification preference')) {
      return res.status(400).json(errorResponse(message));
    }

    return res
      .status(500)
      .json(errorResponse('Failed to update notification preference', error));
  }
}

export async function markNotificationsViewedController(
  req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const body = idsBodySchema.parse(req.body);
    const result = await markNotificationsViewed({
      recipientUserId: getRequestUserId(req),
      companyId: getRequestCompanyId(req),
      notificationIds: body.notificationIds,
    });

    return res
      .status(200)
      .json(successResponse('Notifications viewed', result));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json(errorResponse('Invalid notification ids', error));
    }

    const message = error instanceof Error ? error.message : String(error);
    if (
      message === 'Authenticated user is required' ||
      message === 'Authenticated company context is required'
    ) {
      return res.status(401).json(errorResponse(message));
    }

    return res
      .status(500)
      .json(errorResponse('Failed to mark notifications viewed', error));
  }
}

export async function markNotificationReadController(
  req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const notificationId = z.uuid().parse(req.params.notificationId);
    const result = await markNotificationsRead({
      recipientUserId: getRequestUserId(req),
      companyId: getRequestCompanyId(req),
      notificationIds: [notificationId],
    });

    return res
      .status(200)
      .json(successResponse('Notification marked read', result));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json(errorResponse('Invalid notification id', error));
    }

    const message = error instanceof Error ? error.message : String(error);
    if (
      message === 'Authenticated user is required' ||
      message === 'Authenticated company context is required'
    ) {
      return res.status(401).json(errorResponse(message));
    }

    return res
      .status(500)
      .json(errorResponse('Failed to mark notification read', error));
  }
}

export async function markAllNotificationsReadController(
  req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const result = await markAllNotificationsRead({
      recipientUserId: getRequestUserId(req),
      companyId: getRequestCompanyId(req),
    });

    return res
      .status(200)
      .json(successResponse('Notifications marked read', result));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message === 'Authenticated user is required' ||
      message === 'Authenticated company context is required'
    ) {
      return res.status(401).json(errorResponse(message));
    }

    return res
      .status(500)
      .json(errorResponse('Failed to mark notifications read', error));
  }
}
