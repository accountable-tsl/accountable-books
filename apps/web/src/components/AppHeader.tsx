import React from 'react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { CompanySwitcher } from '@/domains-pending-migration/switchCompany/CompanySwitcher';
import { cn } from '@/lib/utils';
import type { CompanyData } from '@/modules/company/companies';
import { useBreadcrumbs } from '@/shared/hooks/useBreadcrumbs';

import { ThemeToggle } from './ThemeToggle';

type BreadcrumbItem = {
  label: string;
  link?: string;
};

interface AppHeaderProps {
  currentPage?: string;
  breadcrumbs?: BreadcrumbItem[];
  company: CompanyData;
}

// const defaultBreadcrumbs: BreadcrumbItem[] = [{ label: "Home", link: "/" }];

export function AppHeader({ company }: AppHeaderProps) {
  const breadcrumbs = useBreadcrumbs();

  return (
    <header
      className={cn(
        'flex h-12 shrink-0 group-has-data-[collapsible=icon]/sidebar-wrapper:h-12',
        'relative items-center gap-2 border-b transition-[width,height] ease-linear',
        'z-50 flex-shrink-0',
      )}
    >
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

      <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 translate-y-1/2 flex-col rounded text-center text-[0.65rem]">
        <div className="text-muted-foreground truncate whitespace-nowrap">
          You are signed into{' '}
          <strong>
            <span className="text-destructive">
              {company?.isDemoCompany ? 'Demo Company → ' : ''}
            </span>
            {company?.displayName ||
              company?.legalName ||
              'No Company Selected'}
          </strong>
          <span>{company?.countryFlag}</span>
        </div>

        <div className="flex items-center justify-center gap-2">
          <CompanySwitcher />
        </div>
      </div>

      <ThemeToggle />
    </header>
  );
}

export function BodyHead({
  title,
  description,
  className,
  titleClass,
  descriptionClass,
}: {
  title?: string;
  description?: string;
  className?: string;
  titleClass?: string;
  descriptionClass?: string;
}) {
  return (
    <div className={cn('flex flex-col', className)}>
      <h2 className={cn('font-medium tracking-tight', titleClass)}>{title}</h2>
      <p className={cn('text-muted-foreground text-sm', descriptionClass)}>
        {description}
      </p>
    </div>
  );
}
