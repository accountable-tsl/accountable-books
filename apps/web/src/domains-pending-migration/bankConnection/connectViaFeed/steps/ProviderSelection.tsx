import type { BankFeedProvider } from '@/domains-pending-migration/bankFeedProviders/types';
import type { Country } from '@/shared/types/core';
import React, { useCallback, useMemo, useState } from 'react';
import { CenteredLoader } from '@/components/CenteredLoader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { sortProviders } from '@/domains-pending-migration/bankConnection/shared/utils';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/shared/hooks/use-media-query';
import { toTitleCase } from '@/shared/utils/formatting-utils';
import { useSession } from '@session';
import { ArrowLeft, Building, Clock, NetworkIcon, Shield } from 'lucide-react';

import { getProviderData, ProviderWidgets } from '../utils';

interface ProviderSelectionProps {
  selectedCountry: Country;
  onProviderSelect: (provider: BankFeedProvider) => void;
  onWidgetSuccess: (code: string) => Promise<void>;
  providers: BankFeedProvider[];
  onNext: () => void;
  onBack: () => void;
}

export const ProviderSelection = React.memo(
  ({
    selectedCountry,
    providers,
    onProviderSelect,
    onWidgetSuccess,
    onNext,
    onBack,
  }: ProviderSelectionProps) => {
    // States
    const [selectedProvider, setSelectedProvider] =
      useState<BankFeedProvider | null>(null);
    const [widgetOpen, setWidgetOpen] = useState(false);

    // Hooks
    const isMobile = useIsMobile();
    const { user, company, loading } = useSession();

    // Computed
    const userData = useMemo(() => {
      // Potentially problematic function, rerender risk
      if (!selectedProvider?.key || !user || !company) return undefined;

      return selectedProvider?.key && user && company
        ? getProviderData[selectedProvider.key]?.(user, company)
        : undefined;
    }, [selectedProvider, user, company]);

    const sortedProviders = useMemo(() => {
      return sortProviders(providers, {
        prioritizeBy: {
          property: 'status',
          values: ['active'],
        },
        fallbackSort: (a, b) => a.priority - b.priority,
        limit: 2,
      });
    }, [providers]);

    const handleInternalProviderSelection = useCallback(
      (provider: BankFeedProvider) => {
        if (provider.status !== 'active') return;
        setSelectedProvider(provider);
        onProviderSelect(provider);
        setWidgetOpen(true);
      },
      [onProviderSelect],
    );

    const handleWidgetClose = useCallback(() => {
      setWidgetOpen(false);
    }, []);

    const handleNext = useCallback(() => {
      if (selectedProvider) {
        onNext();
      }
    }, [selectedProvider, onNext]);

    const widgetComponent = useMemo(() => {
      if (!selectedProvider || !userData) return null;
      const Widget = ProviderWidgets[selectedProvider.key];
      return Widget ? (
        <Widget
          key={`widget-${selectedProvider.key}`}
          open={widgetOpen}
          onClose={handleWidgetClose}
          data={userData}
          onSuccess={onWidgetSuccess}
        />
      ) : (
        <p>Unsupported provider</p>
      );
    }, [
      selectedProvider,
      widgetOpen,
      handleWidgetClose,
      userData,
      onWidgetSuccess,
    ]);

    const providerCards = useMemo(() => {
      return sortedProviders.map((provider) => {
        const recommended =
          provider.priority === 1 && provider.status === 'active';
        const isSelected = selectedProvider?.key === provider.key;
        const logo = provider.logoUrl;
        const active = provider.status === 'active';

        return (
          <div
            key={provider.id}
            className={cn(
              'h-fit w-full max-w-sm flex-1 cursor-pointer overflow-hidden rounded-sm border p-4 shadow-sm transition-all duration-200',
              isSelected
                ? 'border-blue-600 ring-2 ring-blue-100 dark:ring-blue-900'
                : recommended
                  ? 'border-chart-2/50 hover:border-chart-2'
                  : !active
                    ? 'border-muted-foreground/50 cursor-not-allowed opacity-50'
                    : 'border-muted-foreground/50 hover:border-muted-foreground',
            )}
            onClick={() => handleInternalProviderSelection(provider)}
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'flex h-12 w-12 items-center justify-center object-cover',
                      'rounded-md border bg-white p-0.5 dark:bg-white/70',
                    )}
                  >
                    {logo ? (
                      <img src={provider.logoUrl} alt={provider.name} />
                    ) : (
                      <span className="text-sm font-bold text-blue-600">
                        {provider.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold">{provider.name}</h3>
                    <p className="text-muted-foreground truncate overflow-hidden text-xs">
                      {provider.description}
                    </p>
                  </div>
                </div>
                {(recommended || !active) && (
                  <div className="flex flex-col items-end space-y-1">
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-xs',
                        recommended ? 'bg-green-100 text-green-800' : '',
                      )}
                    >
                      {recommended
                        ? 'Recommended'
                        : toTitleCase(provider.status)}
                    </Badge>
                  </div>
                )}
              </div>

              <div className="text-muted-foreground flex items-center justify-between text-xs opacity-80">
                <div className="flex items-center space-x-3">
                  <span className="flex items-center">
                    <Building className="mr-1 h-3 w-3" />
                    {/* Add no of banks supported */}
                    {provider.name === 'plaid' || provider.name === 'stripe'
                      ? '10,000+'
                      : '300+'}
                  </span>
                  <span className="flex items-center">
                    <Clock className="mr-1 h-3 w-3" />
                    {/* Provider setup time (min) add to db later, maybe */}
                    1-2 min
                  </span>
                </div>
                <div className="flex items-center text-green-600">
                  <Shield className="mr-1 h-3 w-3" />
                  <span>Secure</span>
                </div>
              </div>
            </div>
          </div>
        );
      });
    }, [sortedProviders, selectedProvider, handleInternalProviderSelection]);

    if (loading) return <CenteredLoader />;

    return (
      <>
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <NetworkIcon className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-lg font-semibold">Choose Your Provider</h2>
          <p className="text-muted-foreground mx-auto max-w-md text-sm">
            Select the service that will securely connect to your bank
          </p>
        </div>

        {/* Selected Country Info */}
        <div className="bg-muted mb-6 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-xl">{selectedCountry.flag}</span>
              <span className="font-medium">{selectedCountry.name}</span>
            </div>
            <Button variant="outline" size="sm" onClick={onBack}>
              Change
            </Button>
          </div>
        </div>

        {/* 
      Add this flow after connecting bank account(s)
      //Existing or New Bank Account?
      <div className="flex flex-col gap-2 pb-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="add-as-new"
            checked={addAsNew}
            onCheckedChange={handleAddAsNew}
          />
          <Label htmlFor="add-as-new">Add as new bank account</Label>
        </div>

        {!addAsNew && (
          <BankAccountSelector
            includeActionItem={false}
            onSelect={(bankAccount) => setSelectedBankAccount(bankAccount)}
            //  groupBy="bankName"
          />
        )}
      </div> */}

        {/* Provider Cards */}
        <div
          className={cn(
            'mb-8 flex flex-wrap justify-center gap-2 lg:gap-4',
            isMobile ? 'flex-col items-center' : 'min-h-40',
          )}
        >
          {providerCards}
        </div>

        {widgetComponent}

        {/* Navigation */}
        <div className="flex justify-between pb-6">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={handleNext}
            disabled={!selectedProvider || !widgetOpen}
            className="px-6"
          >
            Continue
          </Button>
        </div>
      </>
    );
  },

  (prevProps, nextProps) => {
    return (
      prevProps.selectedCountry.id === nextProps.selectedCountry.id &&
      prevProps.providers === nextProps.providers &&
      prevProps.onProviderSelect === nextProps.onProviderSelect &&
      prevProps.onBack === nextProps.onBack
    );
  },
);

ProviderSelection.whyDidYouRender = true;
