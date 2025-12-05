import type { CompanyData } from '@/domains-pending-migration/company/types';
import type { AuthUserContext } from '@/modules/auth';

import { MonoWidget } from '../widgets/MonoWidget';
import type { MonoConnectCustomer } from '../widgets/types';

export const ProviderWidgets: Record<string, React.FC<any>> = {
  mono: MonoWidget,
  // plaid: PlaidWidget,
  // etc.
};

export const getProviderData: Record<
  string,
  (user: AuthUserContext, company: CompanyData) => any
> = {
  mono: (user, company): MonoConnectCustomer => {
    const name = company?.legalName;
    const email = user?.email;

    if (!name || !email) {
      throw new Error('Name and email are required for new Mono customer');
    }

    return {
      name,
      email,
    };
  },
  //   plaid: () => ({}),
};
