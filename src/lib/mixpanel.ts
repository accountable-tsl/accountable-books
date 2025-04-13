import mixpanel from "mixpanel";

export const mixpanelClient = mixpanel.init(process.env.MIXPANEL_TOKEN!, {
  protocol: "https",
});
