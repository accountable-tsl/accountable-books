import { NavMainItems } from '@/components/NavMain';
import { useSafeSession, useSession } from '@/features/auth/Session';
import { CompanyType } from '@/shared/types/core';
import {
  BriefcaseIcon,
  CalculatorIcon,
  ClipboardListIcon,
  HelpCircleIcon,
  LayoutDashboardIcon,
  MessageSquareMoreIcon,
  ScaleIcon,
  SearchIcon,
  SettingsIcon,
} from 'lucide-react';
import { routes } from '@/shared/routes/routes';

export const getNavMain = (companyId: string, companyType: CompanyType): NavMainItems[] => {
  return [
    {
      title: 'Dashboard',
      url: routes.general.dashboard.build({ companyId }),
      icon: LayoutDashboardIcon,
    },
    ...(companyType === 'accounting_firm'
      ? [
          {
            title: 'Accounting',
            url: '#',
            icon: CalculatorIcon,
          },
          {
            title: 'Workspace',
            url: '#',
            icon: BriefcaseIcon,
            sub: [
              {
                title: 'Accounting',
                url: routes.accounting.setup.relativePath,
              },
              {
                title: 'Tax',
                url: '#',
              },
            ],
          },
        ]
      : []),
    {
      title: 'Tax',
      url: '#',
      icon: ScaleIcon,
    },
    {
      title: 'Messages',
      url: '#',
      icon: MessageSquareMoreIcon,
    },
    {
      title: 'Reports',
      url: '#',
      icon: ClipboardListIcon,
    },
  ];
};

export const getNavUser = (user: { name: string; email: string; avatar: string }) => {
  return {
    name: `${user.name}`,
    email: `${user.email}`,
    avatar: `${user.avatar}`,
  };
};

export const getNavSecondary = (companyId?: string, companyType?: CompanyType) => {
  return [
    {
      title: 'Settings',
      url: '#',
      icon: SettingsIcon,
    },
    {
      title: 'Get Help',
      url: '#',
      icon: HelpCircleIcon,
    },
    {
      title: 'Search',
      url: '#',
      icon: SearchIcon,
    },
  ];
};
