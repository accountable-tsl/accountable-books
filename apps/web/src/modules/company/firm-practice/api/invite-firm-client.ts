/**
 * Single-client firm invite (mock). When implementing the real API, plan for:
 * - batch/CSV import reusing the same request validation (or a batch wrapper DTO);
 * - chat-driven invite v1 (one client) producing the same body shape as this call.
 */
import type {
  FirmClientInviteRequest,
  FirmClientInviteResponse,
} from '@accountable-books/contracts/schema';
import {
  firmClientInviteRequestSchema,
  firmClientInviteResponseSchema,
} from '@accountable-books/contracts/schema';

export type FirmClientInvitePayload = Omit<
  FirmClientInviteRequest,
  'firmCompanyId'
>;

const MOCK_FIRM_CLIENT_INVITE_HTTP_BODY = {
  invitationId: 'e6666666-6666-4666-8666-666666660001',
  status: 'pending' as const,
  expiresAt: '2099-12-31T23:59:59.000Z',
  clientCompanyId: 'e6666666-6666-4666-8666-666666660002',
};

export async function inviteFirmClient({
  firmCompanyId,
  input,
}: {
  firmCompanyId: string;
  input: FirmClientInvitePayload;
}): Promise<FirmClientInviteResponse> {
  firmClientInviteRequestSchema.parse({
    firmCompanyId,
    ...input,
  });

  return firmClientInviteResponseSchema.parse(
    MOCK_FIRM_CLIENT_INVITE_HTTP_BODY,
  );
}
