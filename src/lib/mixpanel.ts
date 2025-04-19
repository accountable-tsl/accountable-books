import mixpanel from "mixpanel";
import { ENV } from "../config/env";

if (!ENV.MIXPANEL_TOKEN) {
  throw new Error("MIXPANEL_TOKEN must be set");
}

export const mixpanelClient = mixpanel.init(ENV.MIXPANEL_TOKEN, {
  protocol: "https",
});
