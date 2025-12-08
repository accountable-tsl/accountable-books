import z from 'zod';

export const settingTableInput = z.object({
  company_id: z.uuid(),
  key: z.string(),
  bool_value: z.boolean().nullish(),
  int_value: z.number().nullish(),
  string_value: z.string().nullish(),
  json_value: z.record(z.string(), z.unknown()).nullish(),
});

export type SettingTableInput = z.infer<typeof settingTableInput>;

// Individual setting schemas with built-in validation and descriptions
export const autopostRules = z.boolean().describe('Enable autoposting rules');

export const autopostAi = z
  .object({
    enabled: z.boolean().default(false),
    min_confidence: z.number().min(0).max(1),
    delay_minutes: z.coerce
      .number()
      .int()
      .min(0)
      .max(60 * 24 * 7) // 7 days
      .nullish(),
  })
  .describe('Control automatic posting of AI-generated entries to ledger');
export type AutopostAi = z.infer<typeof autopostAi>;

export const trackFxPositions = z
  .boolean()
  .describe('Let AI Track FX positions');
