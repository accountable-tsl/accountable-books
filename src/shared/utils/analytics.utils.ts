import { NODE_ENV } from "../../config/env";
import { mixpanelClient } from "../../lib/mixpanel";
import { TrackingEvent } from "../constants/tracking.constants";

export const trackEvent = (
  event: TrackingEvent,
  distinctId: string,
  props: Record<string, any>
) => {
  mixpanelClient.track(event, {
    distinct_id: distinctId,
    environment: NODE_ENV,
    ...props,
  });
};
