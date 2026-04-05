import type { LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useSession } from '@session';
import { Building, CreditCard, Landmark, Users } from 'lucide-react';

import { canViewWorkspaceBilling } from '../lib/billing-visibility';

export type SettingsSectionId = 'company' | 'financial' | 'team' | 'billing';
export type SettingsSection = {
  id: SettingsSectionId;
  title: string;
  description: string;
  shortDescription?: string;
  href: string;
  icon: LucideIcon;
  group?: 'workspace';
  isHidden?: boolean;
};

export function useSettingsNav() {
  const { tenantRoutes, company, companyType, user } = useSession();

  return useMemo(() => {
    if (!tenantRoutes) return null;
    const s = tenantRoutes.general.settings;
    const showBilling = canViewWorkspaceBilling({
      companyType,
      currentCompany: user?.currentCompany,
      company,
      isPlatformUser: user?.isPlatformUser,
    });

    return {
      hubHref: s.hub(),
      sections: [
        {
          id: 'company',
          title: 'Company',
          description:
            'Review and manage the shared company information your workspace depends on.',
          shortDescription: 'Name, logo, and workspace basics',
          icon: Building,
          href: s.company(),
        },
        {
          id: 'financial',
          title: 'Financial',
          description:
            'See the accounting setup and financial controls that shape how the workspace runs.',
          shortDescription: 'Fiscal year, currency, and accounting defaults',
          icon: Landmark,
          href: s.financial(),
        },
        {
          id: 'team',
          title: 'Team',
          description:
            'Manage who has access to the workspace and how ownership is shared across the team.',
          shortDescription: 'Members, roles, and invitations',
          icon: Users,
          href: s.team(),
        },
        ...(showBilling
          ? [
              {
                id: 'billing',
                title: 'Billing',
                description:
                  'Review how this workspace is billed and where subscription controls will live.',
                shortDescription: 'Plans, invoices, and billing access',
                icon: CreditCard,
                href: s.billing(),
              } satisfies SettingsSection,
            ]
          : []),
      ] satisfies SettingsSection[],
    };
  }, [
    company,
    companyType,
    tenantRoutes,
    user?.currentCompany,
    user?.isPlatformUser,
  ]);
}
