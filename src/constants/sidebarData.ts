import { NavMainItems } from "@/components/NavMain";
import { routes } from "@/shared/routes/routes-old";
import { CompanyType } from "@/shared/types/core";
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
} from "lucide-react";

export const getNavMain = (
  companyId: string,
  companyType: CompanyType
): NavMainItems[] => {
  return [
    {
      title: "Dashboard",
      url: routes.dashboard.buildUrl({ companyId }),
      icon: LayoutDashboardIcon,
    },
    ...(companyType === "accounting_firm"
      ? [
          {
            title: "Accounting",
            url: routes.accounting.index.buildUrl({ companyId }),
            icon: CalculatorIcon,
          },
          {
            title: "Workstation",
            url: routes.accounting.workstation.index.buildUrl({ companyId }),
            icon: BriefcaseIcon,
            sub: [
              {
                title: "Accounting",
                url: routes.accounting.workstation.index.buildUrl({
                  companyId,
                }),
              },
              {
                title: "Tax",
                url: routes.tax.workstation.index.buildUrl({ companyId }),
              },
            ],
          },
        ]
      : []),
    {
      title: "Tax",
      url: routes.tax.index.buildUrl({ companyId }),
      icon: ScaleIcon,
    },
    {
      title: "Messages",
      url: routes.messages.buildUrl({ companyId }),
      icon: MessageSquareMoreIcon,
    },
    {
      title: "Reports",
      url: routes.reports.index.buildUrl({ companyId }),
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

export const getNavSecondary = (
  companyId?: string,
  companyType?: CompanyType
) => {
  return [
    {
      title: "Settings",
      url: "#",
      icon: SettingsIcon,
    },
    {
      title: "Get Help",
      url: "#",
      icon: HelpCircleIcon,
    },
    {
      title: "Search",
      url: "#",
      icon: SearchIcon,
    },
  ];
};
