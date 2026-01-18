import z from 'zod';

import type { AutopostAi } from './settings.types.js';
import { autopostAi, autopostRules } from './settings.types.js';

export const settingRegistry = {
  autopost_rules: autopostRules.default(true),

  autopost_ai: autopostAi.default({
    enabled: false,
    min_confidence: 0.9,
    delay_minutes: 60 * 24 * 7, // If autoposting is enabled and >= 90% confidence and user doesn't post, then we post after 7 days
  } satisfies AutopostAi),

  track_fx_positions: z.boolean().default(false),
} as const satisfies Record<string, z.ZodDefault<any>>;

// Type inference
export type SettingKey = keyof typeof settingRegistry;
export type SettingValue<K extends SettingKey> = z.infer<
  (typeof settingRegistry)[K]
>;
export type SettingDefaults = {
  [K in SettingKey]: z.infer<(typeof settingRegistry)[K]>;
};
