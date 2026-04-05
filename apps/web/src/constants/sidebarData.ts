import type { NavBaseItems, NavMainItems } from '@/components/nav-main';
import { routes } from '@/shared/routes';
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

export const getNavMain = ({
  companyId,
  showAccounting = false,
  showTax = false,
}: {
  companyId: string;
  showAccounting?: boolean;
  showTax?: boolean;
}): NavMainItems[] => {
  return [
    {
      title: 'Dashboard',
      url: routes.general.dashboard.build({ companyId }),
      icon: LayoutDashboardIcon,
    },
    ...(showAccounting
      ? [
          {
            title: 'Accounting',
            url: routes.accounting.index.relativePath,
            icon: CalculatorIcon,
            sub: [
              {
                title: 'Home',
                url: routes.accounting.index.relativePath,
              },
              {
                title: 'Cat Engine',
                url: routes.accounting.catEngine.relativePath,
              },
              {
                title: 'Trial Balance',
                url: routes.accounting.trialBalance.relativePath,
              },
              {
                title: 'Ledger',
                url: routes.accounting.ledger.relativePath,
              },
              {
                title: 'Journals',
                url: routes.accounting.journals.relativePath,
              },
              {
                title: 'Notes',
                url: routes.accounting.notes.relativePath,
              },
            ],
          },
        ]
      : []),
    ...(showTax
      ? [
          {
            title: 'Tax',
            url: '#',
            icon: ScaleIcon,
          },
        ]
      : []),
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

export const getNavPractice = (): NavBaseItems[] => {
  return [
    {
      title: 'Queue',
      url: routes.general.queue.relativePath,
      icon: BriefcaseIcon,
    },
    {
      title: 'Clients',
      url: routes.general.clients.relativePath,
      icon: ClipboardListIcon,
    },
  ];
};

export const getNavUser = (user: {
  name: string;
  email: string;
  avatar: string;
}) => {
  return {
    name: `${user.name}`,
    email: `${user.email}`,
    avatar: `${user.avatar}`,
  };
};

export const getNavSecondary = ({ companyId }: { companyId: string }) => {
  return [
    {
      title: 'Settings',
      url: routes.general.settings.hub.build({ companyId }),
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
