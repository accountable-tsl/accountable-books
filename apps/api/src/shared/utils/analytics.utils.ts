import { NODE_ENV } from '../../config/env.js';
import { mixpanelClient } from '../../lib/mixpanel.js';

import type { TrackingEvent } from '../constants/tracking.constants.js';

export const trackEvent = (
  event: TrackingEvent,
  distinctId: string,
  props: Record<string, any>,
) => {
  mixpanelClient.track(event, {
    distinct_id: distinctId,
    environment: NODE_ENV,
    ...props,
  });
};
