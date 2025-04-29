import {
  ArrowUpCircleIcon,
  AudioWaveform,
  Calendar,
  GalleryVerticalEnd,
  Home,
  Inbox,
  Search,
  Settings,
  UserIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useCompany } from "@/domains/company/store";
import { Link } from "react-router-dom";
import {
  getNavMain,
  getNavSecondary,
  getNavUser,
} from "@/constants/sidebarData";
import { NavMain } from "../NavMain";
import { NavUser } from "../NavUser";
import { useAuth } from "@/hooks/useAuth";
import { NavSecondary } from "../NavSecondary";
import { routes } from "@/shared/routes";

export interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  sidebarCollapsible?: "icon" | "offcanvas";
  defaultCollapsed?: boolean;
}

export function AppSidebar({
  sidebarCollapsible = "icon",
  ...props
}: AppSidebarProps) {
  // Side bar options, depending on page, I'd use collapsible or icon
  // e.g on categorization engine, we'd use collapsible but on dashboard, we'd use icon
  const { companyId, companyType, company } = useCompany();
  const { user } = useAuth();
  console.log(company, user);

  if (!companyId || !companyType) return null;
  const navMain = getNavMain(companyId, companyType);
  const navSecondary = getNavSecondary(companyId, companyType);
  const navUser = getNavUser({
    name: user.firstname,
    email: user.email,
    avatar: user.avatar || "",
  });

  return (
    <Sidebar collapsible={sidebarCollapsible} {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link
                to={routes.dashboard.staticPath}
                className="flex items-center gap-2"
              >
                <div className="flex items-center justify-center h-5 w-5 overflow-hidden">
                  {company?.assignedFirmLogo ? (
                    <img
                      src={company?.assignedFirmLogo}
                      alt={`${company?.assignedFirmName} Logo`}
                    />
                  ) : (
                    <ArrowUpCircleIcon />
                  )}
                </div>
                <span className="truncate text-base font-semibold">
                  {company?.assignedFirmName}
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={navUser} />
      </SidebarFooter>
    </Sidebar>
  );
}

// export function OnboardingSidebar() {
//   return (
//     <Sidebar>
//       <SidebarContent>
//         <SidebarGroup>
//           <SidebarGroupLabel>Application</SidebarGroupLabel>
//           <SidebarGroupContent>
//             <SidebarMenu>
//               {items.map((item) => (
//                 <SidebarMenuItem key={item.title}>
//                   <SidebarMenuButton asChild>
//                     <a href={item.url}>
//                       <item.icon />
//                       <span>{item.title}</span>
//                     </a>
//                   </SidebarMenuButton>
//                 </SidebarMenuItem>
//               ))}
//             </SidebarMenu>
//           </SidebarGroupContent>
//         </SidebarGroup>
//       </SidebarContent>
//     </Sidebar>
//   );
// }
