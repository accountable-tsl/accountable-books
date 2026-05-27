import z from 'zod';

const sequenceScope = z.enum(['journal']);
export type SequenceScope = z.infer<typeof sequenceScope>;

export const allocateSequenceInput = z.object({
  companyId: z.uuid(),
  scope: sequenceScope,
  bucket: z.string(),
});

export type AllocateSequenceInput = z.infer<typeof allocateSequenceInput>;
