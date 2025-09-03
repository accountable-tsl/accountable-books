# Banking Integration Flow

Complete guide to the bank account connection process.

## Overview

Users connect their bank accounts through a multi-step wizard that supports Plaid (US/CA) and Mono (Nigeria) providers, with CSV upload as fallback.

## User Journey

### 1. Initial Entry

User visits `/banking/connect` and sees the [`BankConnectionFlow`](./components/connection-flow.tsx) component which displays [`WelcomeStep`](./components/steps/welcome-step.tsx) first.

### 2. Welcome Screen Actions

- **Auto-detected country**: If country is supported, user can click "Connect your bank"
- **No country/unsupported**: Button shows "Choose a different country"
- **CSV option**: "Prefer to upload a file instead?" link calls `handleSkipToCSV()`

### 3. Country Selection (if needed)

- If user clicks "Choose a different country", [`handleWelcomeContinue()`](./components/connection-flow.tsx#L74) navigates to `country-select` step
- [`CountrySelectStep`](./components/steps/country-select-step.tsx) displays available countries
- When country is selected, [`handleCountrySelect()`](./components/connection-flow.tsx#L43) determines the flow:
  - **Supported country + 1 provider**: Calls `setSelectedProvider(strategy.provider)` and `createLinkToken(strategy.provider)` directly (skips to step 5)
  - **Supported country + multiple providers**: Calls `setCurrentStep('provider-select')` (goes to step 4)
  - **Unsupported country**: Redirects to CSV upload

### 4. Provider Selection (if multiple available)

- [`ProviderSelectStep`](./components/steps/provider-select-step.tsx) displays available providers (e.g., Plaid + Teller for US)
- [`handleProviderSelect()`](./components/connection-flow.tsx#L147) calls `createLinkToken()` for chosen provider

### 5. Link Token Creation

- [`createLinkToken()`](./components/connection-flow.tsx#L102) function calls [`createLinkTokenMutation`](./hooks/use-banking-api.ts#L5)
- **API Call**: `POST /banking/link-token` with `{ provider, userId, companyId }`
- **Backend**: [`BankingController.createLinkToken()`](../../../api/src/domains/banking/banking.controller.ts#L5) → [`BankingService.createLinkToken()`](../../../api/src/integrations/banking/banking.service.ts#L22) → Provider-specific implementation
- **Success**: Sets `linkToken` state and calls `setCurrentStep('connecting')`

### 6. Widget Rendering Trigger

- **Step change**: `setCurrentStep('connecting')` triggers React re-render
- **Condition check**: [`renderCurrentStep()`](./components/connection-flow.tsx#L158) hits `'connecting'` case
- **Render decision**: If both `selectedProvider && linkToken` exist, renders [`ProviderWidget`](./components/provider-widget.tsx)
- **Fallback**: Shows "Creating connection..." loading state if token/provider missing

### 7. Bank Connection Widget

- [`ProviderWidget`](./components/provider-widget.tsx) renders provider-specific widget:
  - **Plaid**: [`PlaidWidget`](./components/plaid-widget.tsx) with Link SDK
  - **Mono**: [`MonoWidget`](./components/mono-widget.tsx) with Connect widget
- User completes bank authentication in provider's interface
- Widget calls `onSuccess` with `publicToken` from bank

### 8. Token Exchange

- [`exchangeToken()`](./components/connection-flow.tsx#L125) function calls [`exchangeTokenMutation`](./hooks/use-banking-api.ts#L16)
- **API Call**: `POST /banking/exchange-token` with `{ provider, publicToken, metadata }`
- **Backend**: [`BankingController.exchangeToken()`](../../../api/src/domains/banking/banking.controller.ts#L36) → [`BankingService.exchangeToken()`](../../../api/src/integrations/banking/banking.service.ts#L40) → Provider exchange
- **Success**: Navigates to `success` step and shows success message

## Technical Flow

```
User Action → Frontend Handler → React Query Mutation → API Endpoint → Banking Service → Provider Implementation
```

### Key Decision Points

1. **Country Support**: [`getProviderSelectionStrategy()`](./utils/providers.ts#L53) determines:
   - `auto-direct`: Single provider available
   - `show-selection`: Multiple providers available
   - `csv-fallback`: No providers for country

2. **Provider Strategy**: Based on [`BANK_PROVIDERS`](./utils/providers.ts#L16) configuration:
   - US: Plaid (auto-direct)
   - CA: Plaid (auto-direct)
   - NG: Mono (auto-direct)
   - Others: CSV fallback

## API Endpoints

| Endpoint                       | Method | Purpose                                | Handler                                                                               |
| ------------------------------ | ------ | -------------------------------------- | ------------------------------------------------------------------------------------- |
| `/banking/link-token`          | POST   | Create provider link token             | [`createLinkToken`](../../../api/src/domains/banking/banking.controller.ts#L5)        |
| `/banking/exchange-token`      | POST   | Exchange public token for access token | [`exchangeToken`](../../../api/src/domains/banking/banking.controller.ts#L36)         |
| `/banking/supported-countries` | GET    | Get list of supported countries        | [`getSupportedCountries`](../../../api/src/domains/banking/banking.controller.ts#L74) |

## Key Components

| Component                                                           | Responsibility                                  | Location                         |
| ------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------- |
| [`BankConnectionFlow`](./components/connection-flow.tsx)            | Main orchestrator, handles state and navigation | `connection-flow.tsx`            |
| [`WelcomeStep`](./components/steps/welcome-step.tsx)                | First screen, country detection                 | `steps/welcome-step.tsx`         |
| [`CountrySelectStep`](./components/steps/country-select-step.tsx)   | Country selection interface                     | `steps/country-select-step.tsx`  |
| [`ProviderSelectStep`](./components/steps/provider-select-step.tsx) | Provider choice (when multiple available)       | `steps/provider-select-step.tsx` |
| [`ProviderWidget`](./components/provider-widget.tsx)                | Provider-specific connection widget             | `provider-widget.tsx`            |

## Provider Support

### Current Providers

- **Plaid**: US, Canada - Production ready
- **Mono**: Nigeria - Production ready

### Future Providers (Commented Out)

- **Teller**: US - Add to [`BANK_PROVIDERS`](./utils/providers.ts#L31) when ready
- **GoCardless**: UK, EU - Backend integration needed

### Adding New Providers

1. Implement [`BankingProvider`](../../../api/src/integrations/banking/types/base.ts#L22) interface in backend
2. Add to [`ProviderRegistry`](../../../api/src/integrations/banking/providers/registry.ts)
3. Add provider config to [`BANK_PROVIDERS`](./utils/providers.ts#L16)
4. Create widget component in [`components/providers/`](./components/providers/)
5. Add case to [`ProviderWidget`](./components/provider-widget.tsx)

## Error Handling

- **User Feedback**: Toast notifications via [`use-banking-api.ts`](./hooks/use-banking-api.ts)
- **Loading States**: Tracked via mutation `isPending` states
- **Fallbacks**: CSV upload always available via `handleSkipToCSV()`
- **Provider Errors**: Handled in [`BankingService.exchangeToken()`](../../../api/src/integrations/banking/banking.service.ts#L44) with user-friendly messages
