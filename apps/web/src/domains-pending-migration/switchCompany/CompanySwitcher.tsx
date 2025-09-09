import { useState, useMemo } from 'react';
import {
  ChevronDownIcon,
  SearchIcon,
  BuildingIcon,
  UserIcon,
  Building2Icon,
  UsersIcon,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useSession } from '@/app/session';
import { useCompanySwitch } from '@/domains-pending-migration/switchCompany/hooks';
import { cn } from '@/lib/utils';
import type { AuthCompanyContext } from '@/modules/auth';
import { toTitleCase } from '@/shared/utils/formatting-utils';

const MAX_VISIBLE_COMPANIES = 4;
const COMPANY_ITEM_HEIGHT = 56; // Approximate height in pixels for each company item

// TODO: Store last few companies user switch from and to in local storage and clear them after a certain time. Those should be candidates for the dropdown while the current setup should be fallback.

export function CompanySwitcher() {
  const { user } = useSession();
  const { switchCompany, isSwitching, handleExitDemo } = useCompanySwitch();
  const [searchTerm, setSearchTerm] = useState('');
  const [open, setOpen] = useState(false);

  if (!user?.companies || user.companies.length <= 1) {
    return null; // Don't show switcher if user has access to only one company
  }

  const companies = user.companies;
  const getCompanyName = (company: AuthCompanyContext) =>
    company.displayName || company.legalName || toTitleCase(company.id.slice(0, 8) + '...');
  const isAccountingFirmUser = user.currentCompany.companyType === 'accounting_firm';

  // Helper to detect demo users by email
  const isDemoUser = (email: string) => {
    const demoEmails = [
      'demo.us@example.com',
      'demo.ng@example.com',
      'demo.us@getaccountable.com',
      'demo.ng@getaccountable.com',
      'demo@getaccountable.com',
    ];
    return demoEmails.includes(email);
  };

  // Helper functions for demo company logic
  const isNigerianCompany = (companyId: string) => companyId.includes('NG');

  const getMatchingDemoCompany = useMemo(() => {
    const demoCompanies = companies.filter((c) => c.isDemoCompany);
    const currentIsNG = isNigerianCompany(user.currentCompanyId);
    const currentType = user.currentCompany.companyType;

    // Find demo matching both type and region
    const exactMatch = demoCompanies.find(
      (demo) => demo.companyType === currentType && isNigerianCompany(demo.id) === currentIsNG,
    );

    if (exactMatch) return exactMatch;

    // Fallback: any demo of same type
    const typeMatch = demoCompanies.find((demo) => demo.companyType === currentType);
    if (typeMatch) return typeMatch;

    return null;
  }, [companies, user.currentCompanyId, user.currentCompany.companyType]);

  // Check if user is searching for demo companies
  const isDemoSearch = searchTerm.toLowerCase().includes('demo');

  // Separate demo and regular companies
  const { demoCompanies, regularCompanies } = useMemo(() => {
    const demo = companies.filter((c) => c.isDemoCompany);
    const regular = companies.filter((c) => !c.isDemoCompany);
    return { demoCompanies: demo, regularCompanies: regular };
  }, [companies]);

  // Process companies based on search
  const visibleCompanies = useMemo(() => {
    // If searching for demo, show all demo companies
    if (isDemoSearch) {
      return demoCompanies.sort((a, b) => {
        if (a.id === user.currentCompanyId) return -1;
        if (b.id === user.currentCompanyId) return 1;
        return getCompanyName(a).localeCompare(getCompanyName(b));
      });
    }

    // If general search, filter all companies
    if (searchTerm.trim()) {
      return companies
        .filter((company) =>
          getCompanyName(company).toLowerCase().includes(searchTerm.toLowerCase()),
        )
        .sort((a, b) => {
          if (a.id === user.currentCompanyId) return -1;
          if (b.id === user.currentCompanyId) return 1;
          return getCompanyName(a).localeCompare(getCompanyName(b));
        });
    }

    // Default view: current + up to 2 others + matching demo
    const sortedRegular = regularCompanies.sort((a, b) => {
      if (a.id === user.currentCompanyId) return -1;
      if (b.id === user.currentCompanyId) return 1;
      return getCompanyName(a).localeCompare(getCompanyName(b));
    });

    // Take first 3 regular companies (current + 2 others)
    const displayList = sortedRegular.slice(0, 3);

    // Add matching demo company if not already in list
    if (getMatchingDemoCompany && !displayList.find((c) => c.id === getMatchingDemoCompany.id)) {
      displayList.push(getMatchingDemoCompany);
    }

    return displayList;
  }, [
    searchTerm,
    isDemoSearch,
    companies,
    demoCompanies,
    regularCompanies,
    user.currentCompanyId,
    getMatchingDemoCompany,
  ]);

  const handleCompanySwitch = async (company: AuthCompanyContext) => {
    if (company.id === user.currentCompanyId || isSwitching) return;

    setOpen(false);
    await switchCompany({
      fromCompanyId: user.currentCompanyId,
      toCompanyId: company.id,
      // Remember current company when switching to demo
      rememberCurrentAsOriginal: company.isDemoCompany,
      // Error toast is already handled in the hook, no need for onError callback
    });
  };

  const companyConfig = {
    accounting_firm: { icon: Building2Icon, label: 'Firm' },
    business: { icon: BuildingIcon, label: 'Business' },
    individual: { icon: UserIcon, label: 'Individual' },
  } as const;

  const getCompanyConfig = (type: string) =>
    companyConfig[type as keyof typeof companyConfig] || { icon: BuildingIcon, label: 'Company' };

  // Show search when there are many companies or demo companies exist
  const showSearch = companies.length > MAX_VISIBLE_COMPANIES || demoCompanies.length > 0;

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <div className="flex items-center justify-center gap-1 text-blue-500 hover:text-blue-500/80 cursor-pointer">
            <span className="text-xs">switch</span>
            <ChevronDownIcon size={10} />
          </div>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="center"
          className="w-80 max-h-96 overflow-hidden"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="px-2 py-2">
            <div className="text-xs text-muted-foreground mb-2">Switch Company</div>

            {showSearch && (
              <div className="relative mb-2">
                <SearchIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search companies..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
            )}
          </div>

          <div
            className="overflow-y-auto"
            style={{ maxHeight: `${MAX_VISIBLE_COMPANIES * COMPANY_ITEM_HEIGHT}px` }}
          >
            {visibleCompanies.length === 0 && searchTerm ? (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                No companies found matching "{searchTerm}"
              </div>
            ) : (
              visibleCompanies.map((company) => {
                const isCurrentCompany = company.id === user.currentCompanyId;
                const companyName = getCompanyName(company);

                return (
                  <DropdownMenuItem
                    key={company.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 cursor-pointer',
                      isCurrentCompany && 'bg-accent',
                      isSwitching && 'opacity-50 pointer-events-none',
                    )}
                    onClick={() => handleCompanySwitch(company)}
                    disabled={isCurrentCompany || isSwitching}
                  >
                    <div className="flex-shrink-0">
                      {(() => {
                        const { icon: Icon } = getCompanyConfig(company.companyType);
                        return <Icon className="h-4 w-4" />;
                      })()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{companyName}</span>
                        {isCurrentCompany && (
                          <Badge variant="secondary" className="text-xs px-1 py-0">
                            Current
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{getCompanyConfig(company.companyType).label}</span>
                        {company.isDemoCompany && (
                          <>
                            <span>•</span>
                            <Badge variant="outline" className="text-xs px-1 py-0">
                              Demo
                            </Badge>
                          </>
                        )}
                      </div>
                    </div>
                  </DropdownMenuItem>
                );
              })
            )}
          </div>

          {(companies.length > 3 || isAccountingFirmUser) && (
            <>
              <DropdownMenuSeparator />
              <div className="px-3 py-2 space-y-2">
                {isAccountingFirmUser && (
                  <DropdownMenuItem
                    className="flex items-center gap-2 px-2 py-1 cursor-pointer text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    onClick={() => {
                      window.location.href = '/clients';
                      setOpen(false);
                    }}
                  >
                    <UsersIcon className="h-4 w-4" />
                    <span className="text-sm">View All Clients</span>
                  </DropdownMenuItem>
                )}
                {companies.length > 3 && (
                  <div className="text-xs text-muted-foreground">
                    {companies.length} companies available
                  </div>
                )}
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {user?.currentCompany?.isDemoCompany && !isDemoUser(user.email) && (
        <button
          onClick={() => handleExitDemo()}
          className="text-red-500 hover:text-red-400 text-xs underline ml-2"
          disabled={isSwitching}
        >
          exit demo
        </button>
      )}
    </>
  );
}
