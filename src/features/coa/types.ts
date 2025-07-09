import { z } from "zod";

export const coaSource = z.enum(["user", "system", "template"]);
export type CoaSource = z.infer<typeof coaSource>;
