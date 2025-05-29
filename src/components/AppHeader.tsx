import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";
import React from "react";
import { ThemeToggle } from "./ThemeToggle";
import { ChevronDownIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { pageStore } from "@/shared/stores/page";
import { useCompany } from "@/domains/company/store";

type BreadcrumbItem = {
  label: string;
  link?: string;
};

interface AppHeaderProps {
  currentPage?: string;
  breadcrumbs?: BreadcrumbItem[];
}

// const defaultBreadcrumbs: BreadcrumbItem[] = [{ label: "Home", link: "/" }];

export function AppHeader({}: // currentPage = "Home",
// breadcrumbs = defaultBreadcrumbs,
AppHeaderProps) {
  const { company } = useCompany();
  const { breadcrumbs } = pageStore();

  console.log("AppHeader breadcrumbs:", breadcrumbs);

  return (
    <header className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear relative">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((item, index) => (
              <React.Fragment key={`${item.label}-${index}`}>
                <BreadcrumbItem className="hidden md:block">
                  {index === breadcrumbs.length - 1 ? (
                    <BreadcrumbPage>{item.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink href={item.link}>
                      {item.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {index < breadcrumbs.length - 1 && (
                  <BreadcrumbSeparator className="hidden md:block" />
                )}
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="text-center text-[0.65rem] rounded absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-1/2 flex flex-col">
        <div className="text-muted-foreground">
          You are signed into{" "}
          <strong>
            {company?.displayName ||
              company?.legalName ||
              "No Company Selected"}
          </strong>
          <span>{company?.countryFlag}</span>
        </div>
        {/* TODO: Handle company switching later */}
        <Link
          to="#"
          className="flex items-center justify-center gap-1 text-blue-500"
        >
          switch
          <ChevronDownIcon size={10} />
        </Link>
      </div>

      <ThemeToggle />
    </header>
  );
}
