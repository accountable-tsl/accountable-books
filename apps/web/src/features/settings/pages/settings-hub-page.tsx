import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { getAvatarInitials } from '@/shared/utils/formatting-utils';
import { useSession } from '@session';
import { ChevronRight } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router';

import { useSettingsNav } from '../config/settings-sections';

const rowFocus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset';

const rowButton =
  'group flex w-full items-center gap-3 px-2 py-3.5 text-left transition-colors hover:bg-muted/40 active:bg-muted/60';

const rowChevron =
  'text-muted-foreground/40 group-hover:text-muted-foreground/60 group-active:text-foreground/60 size-4 shrink-0';

/** Shared pattern for mobile settings-style rows (reusable for account profile later). */
function SettingsHubRow({
  onClick,
  leading,
  title,
  subtitle,
}: {
  onClick: () => void;
  leading: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button type="button" onClick={onClick} className={cn(rowButton, rowFocus)}>
      <div className="flex size-10 shrink-0 items-center justify-center">
        {leading}
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-foreground truncate text-sm font-medium">
          {title}
        </span>
        <span className="text-muted-foreground mt-0.5 line-clamp-2 text-xs leading-snug">
          {subtitle}
        </span>
      </div>
      <ChevronRight className={rowChevron} aria-hidden />
    </button>
  );
}

export function SettingsHubPage() {
  const nav = useSettingsNav();
  const { user, company } = useSession();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  if (!nav) return null;

  if (isDesktop) {
    return <Navigate to="company" replace />;
  }

  const hubSections = nav.sections.filter((s) => s.id !== 'company');
  const companyName =
    company?.displayName ||
    company?.legalName ||
    user?.currentCompany?.displayName ||
    user?.currentCompany?.legalName ||
    'My Workspace';
  const logoUrl = company?.companyLogo ?? undefined;

  return (
    <div className="divide-border/40 flex flex-col divide-y overflow-hidden">
      <SettingsHubRow
        onClick={() => navigate('company')}
        leading={
          <Avatar className="size-10 rounded-lg">
            <AvatarImage src={logoUrl} alt="" className="object-cover" />
            <AvatarFallback className="rounded-lg text-sm font-medium">
              {getAvatarInitials(companyName)}
            </AvatarFallback>
          </Avatar>
        }
        title={companyName}
        subtitle="Company profile"
      />

      {hubSections.map((section) => {
        const Icon = section.icon;
        return (
          <SettingsHubRow
            key={section.id}
            onClick={() => navigate(section.href)}
            leading={
              <Icon
                className="text-foreground/70 group-hover:text-foreground group-active:text-foreground size-4.5 transition-colors"
                aria-hidden
              />
            }
            title={section.title}
            subtitle={section.shortDescription}
          />
        );
      })}
    </div>
  );
}
