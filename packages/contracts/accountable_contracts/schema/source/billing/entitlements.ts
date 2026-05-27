import { z } from 'zod';

export const entitlementSubjectTypeSchema = z.enum([
  'firm',
  'business',
  'individual',
  'workspace',
]);
export type EntitlementSubjectType = z.infer<
  typeof entitlementSubjectTypeSchema
>;

export const entitlementSnapshotSchema = z.object({
  subjectType: entitlementSubjectTypeSchema,
  subjectId: z.string().trim().min(1).max(128),
  planKey: z.string().trim().min(1).max(120),
  computedAt: z.iso.datetime(),
});
export type EntitlementSnapshot = z.infer<typeof entitlementSnapshotSchema>;
