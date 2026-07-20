import { devEmailProvider } from './dev-email.provider.js';
import { postmarkEmailProvider } from './postmark-email.provider.js';
import { registerCommsProvider } from './provider-registry.js';
import { sesEmailProvider } from './ses-email.provider.js';

registerCommsProvider(devEmailProvider);
registerCommsProvider(postmarkEmailProvider);
registerCommsProvider(sesEmailProvider);

export { devEmailProvider } from './dev-email.provider.js';
export { postmarkEmailProvider } from './postmark-email.provider.js';
export { sesEmailProvider } from './ses-email.provider.js';
export {
  getCommsProvider,
  listCommsProviders,
  registerCommsProvider,
  resetCommsProvidersForTest,
  resolveCommsProvider,
} from './provider-registry.js';
export type { CommsProvider, RenderedCommsMessage } from './provider.types.js';
