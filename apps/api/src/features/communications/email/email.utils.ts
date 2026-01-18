import { ENV } from '../../../config/env.js';
import {
  type UrlParamMap,
  type UrlParams,
  type UrlType,
} from './email.types.js';

const routePaths: Record<UrlType, string> = {
  'verify-email': 'verify-email',
  'reset-password': 'reset-password',
  'accept-invite': 'accept-invite',
};

export const buildEmailServiceUrl = <T extends UrlType>(
  type: T,
  params: UrlParamMap[T],
): string => {
  const baseUrl = ENV.FRONTEND_URL?.trim().replace(/\/+$/, ''); // remove trailing slashes
  if (!baseUrl) throw new Error('BASE_URL is not set');

  if (!params.token) {
    throw new Error('Token parameter is required');
  }

  const rawPath = routePaths[type];
  if (!rawPath) throw new Error(`No path defined for URL type: ${type}`);
  const cleanPath = rawPath.replace(/^\/+/, '');

  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      query.append(key, value);
    }
  });

  return `${baseUrl}/${cleanPath}?${query.toString()}`;
};
