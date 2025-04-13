import { NODE_ENV } from "../../config/env";
import { mixpanelClient } from "../../lib/mixpanel";

export const trackEvent = (
  event: string,
  distinctId: string,
  props: Record<string, any>
) => {
  mixpanelClient.track(event, {
    distinct_id: distinctId,
    environment: NODE_ENV,
    ...props,
  });
};
