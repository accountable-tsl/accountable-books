import { Button } from "@/components/ui/button";
import { BankFeedProvider } from "@/domains/bankFeedProviders/types";
import { Country } from "@/shared/types/core";
import { Building, Clock, NetworkIcon, Shield } from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { sortProviders } from "@/features/bankConnection/shared/utils";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { toTitleCase } from "@/shared/utils/formattingUtils";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { BankAccountWithMeta } from "@/domains/bankAccounts/types";
import { useCompany } from "@/domains/company/store";
import { useAuth } from "@/features/auth/hooks";
import { getProviderData, ProviderWidgets } from "../utils";
import {
  handleBankAccountConnection,
  handleMonoConnection,
} from "../../widgets/api";

interface ProviderSelectionProps {
  selectedCountry: Country;
  onProviderSelect: (provider: BankFeedProvider) => void;
  providers: BankFeedProvider[];
  onNext: () => void;
  onBack: () => void;
}

export const ProviderSelection = React.memo(
  ({
    selectedCountry,
    providers,
    onProviderSelect,
    onNext,
    onBack,
  }: ProviderSelectionProps) => {
    // States
    const [selectedProvider, setSelectedProvider] =
      useState<BankFeedProvider | null>(null);
    const [widgetOpen, setWidgetOpen] = useState(false);

    // Hooks
    const isMobile = useIsMobile();
    const { company } = useCompany();
    const { user } = useAuth();

    // Computed
    const userData = useMemo(() => {
      // Potentially problematic
      return selectedProvider?.key && user && company
        ? getProviderData[selectedProvider.key]?.(user, company)
        : undefined;
    }, [selectedProvider, user, company]);

    console.log(selectedProvider);
    console.log({ userData });

    const sortedProviders = useMemo(() => {
      return sortProviders(providers, {
        prioritizeBy: {
          property: "status",
          values: ["active"],
        },
        fallbackSort: (a, b) => a.priority - b.priority,
        limit: 2,
      });
    }, [providers]);

    const handleProviderSelectInternal = useCallback(
      (provider: BankFeedProvider) => {
        if (provider.status !== "active") return;

        setSelectedProvider(provider);
        onProviderSelect(provider);
        setWidgetOpen(true);
      },
      [onProviderSelect]
    );

    const handleWidgetClose = useCallback(() => {
      setWidgetOpen(false);
    }, []);

    const handleWidgetSuccess = useCallback(
      async (code: string) => {
        if (!selectedProvider || !company) return;
        try {
          switch (selectedProvider.key) {
            case "mono":
              const res = await handleMonoConnection({
                companyId: company.id,
                data: {
                  code,
                },
              });

              console.log(res);
              break;

            default:
              break;
          }
        } catch (error) {
          console.error(error);
        }
      },
      [selectedProvider, company]
    );

    const handleNext = useCallback(() => {
      if (selectedProvider) {
        onNext();
      }
    }, []);

    const widgetComponent = useMemo(() => {
      if (!selectedProvider || !userData) return null;
      const Widget = ProviderWidgets[selectedProvider.key];
      return Widget ? (
        <Widget
          key={`widget-${selectedProvider.key}`}
          open={widgetOpen}
          onClose={handleWidgetClose}
          // data={userData}
          onSuccess={handleWidgetSuccess}
        />
      ) : (
        <p>Unsupported provider</p>
      );
    }, [
      selectedProvider,
      widgetOpen,
      handleWidgetClose,
      userData,
      handleWidgetSuccess,
    ]);

    const providerCards = useMemo(() => {
      return sortedProviders.map((provider) => {
        const recommended =
          provider.priority === 1 && provider.status === "active";
        const isSelected = selectedProvider?.key === provider.key;
        const logo = provider.logoUrl;
        const active = provider.status === "active";

        return (
          <div
            key={provider.id}
            className={cn(
              "cursor-pointer w-full flex-1 transition-all duration-200 border rounded-sm p-4 shadow-sm max-w-sm overflow-hidden",
              isSelected
                ? "border-blue-600 ring-2 ring-blue-100 dark:ring-blue-900"
                : recommended
                ? "border-chart-2/50 hover:border-chart-2"
                : !active
                ? "border-muted-foreground/50 opacity-50 cursor-not-allowed"
                : "border-muted-foreground/50 hover:border-muted-foreground"
            )}
            onClick={() => handleProviderSelectInternal(provider)}
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "w-12 h-12 flex items-center justify-center object-cover",
                      "p-0.5 bg-white dark:bg-white/70 rounded-md border"
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
                    <p className="text-xs text-muted-foreground truncate overflow-hidden">
                      {provider.description}
                    </p>
                  </div>
                </div>
                {(recommended || !active) && (
                  <div className="flex flex-col items-end space-y-1">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-xs",
                        recommended ? "bg-green-100 text-green-800" : ""
                      )}
                    >
                      {recommended
                        ? "Recommended"
                        : toTitleCase(provider.status)}
                    </Badge>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground opacity-80">
                <div className="flex items-center space-x-3">
                  <span className="flex items-center">
                    <Building className="w-3 h-3 mr-1" />
                    {/* Add no of banks supported */}
                    {provider.name === "plaid" || provider.name === "stripe"
                      ? "10,000+"
                      : "300+"}
                  </span>
                  <span className="flex items-center">
                    <Clock className="w-3 h-3 mr-1" />
                    {/* Provider setup time (min) add to db later, maybe */}
                    1-2 min
                  </span>
                </div>
                <div className="flex items-center text-green-600">
                  <Shield className="w-3 h-3 mr-1" />
                  <span>Secure</span>
                </div>
              </div>
            </div>
          </div>
        );
      });
    }, [sortProviders, selectedProvider, handleProviderSelectInternal]);

    return (
      <>
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <NetworkIcon className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">Choose Your Provider</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Select the service that will securely connect to your bank
          </p>
        </div>

        {/* Selected Country Info */}
        <div className="bg-muted rounded-lg p-4 mb-6">
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
            "flex gap-2 lg:gap-4 mb-8 flex-wrap",
            isMobile ? "flex-col items-center" : ""
          )}
        >
          {providerCards}
        </div>

        {widgetComponent}
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
  }
);
