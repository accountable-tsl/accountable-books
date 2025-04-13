import { z } from "zod";

const trackingEvent = z.enum(["User Signed Up", "Company Created"]);
export type TrackingEvent = z.infer<typeof trackingEvent>;
