import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  CountryCode,
  Products,
  type LinkTokenCreateRequest,
  type AuthGetResponse,
} from 'plaid';
import {
  BankingProvider,
  type ProviderError,
  type ProviderAccount,
  type ProviderInstitution,
} from '../types/base.js';
import { ENV } from 'src/config/env.js';
import { mapPlaidAccountType } from '../utils/mappings.js';

export class PlaidProvider extends BankingProvider {
  readonly key = 'plaid';
  readonly name = 'Plaid';

  private client: PlaidApi;

  constructor() {
    super();

    const configuration = new Configuration({
      basePath: PlaidEnvironments[ENV.PLAID_ENV!],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': ENV.PLAID_CLIENT_ID,
          'PLAID-SECRET': ENV.PLAID_SECRET,
          'Plaid-Version': ENV.PLAID_VERSION || '2020-09-14',
        },
      },
    });

    this.client = new PlaidApi(configuration);
  }

  async createLinkToken({
    userId,
    companyId,
  }: {
    userId: string;
    companyId: string;
  }): Promise<string> {
    try {
      // get actual country code as retrieved from api, fallback to ENV or maybe env is simpler
      const countries = (ENV.PLAID_COUNTRY_CODES || 'US,CA').split(',') as CountryCode[];
      const products = (ENV.PLAID_PRODUCTS || 'auth,transactions').split(',') as Products[];
      const clientName = ENV.FEED_DISPLAY_NAME || 'Accountable';

      const config: LinkTokenCreateRequest = {
        user: { client_user_id: userId },
        client_name: clientName,
        country_codes: countries,
        language: 'en',
        products: products,
        webhook: `${ENV.BACKEND_URL}/webhooks/plaid/${companyId}`,
      };

      if (ENV.PLAID_REDIRECT_URI) {
        config.redirect_uri = ENV.PLAID_REDIRECT_URI;
      }

      const response = await this.client.linkTokenCreate(config);
      return response.data.link_token;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async exchangeToken({
    publicToken,
  }: {
    publicToken: string;
  }): Promise<{ accessToken: string; itemId?: string }> {
    try {
      const response = await this.client.itemPublicTokenExchange({
        public_token: publicToken,
      });

      console.log('Exchange token response:', response.data);

      return {
        accessToken: response.data.access_token,
        itemId: response.data.item_id,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async fetchBankAccounts({ accessToken }: { accessToken: string }): Promise<ProviderAccount[]> {
    try {
      const res = await this.client.authGet({ access_token: accessToken });
      const accountData = res.data;
      return this.mapAuthGetResponse(accountData);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Get institution by id from plaid
  async getInstitutionById({
    institutionId,
    countryCodes = ['US', 'CA'],
  }: {
    institutionId: string;
    countryCodes?: string[];
  }): Promise<ProviderInstitution[]> {
    try {
      // Map string country codes to Plaid's CountryCode enum
      const plaidCountryCodes = countryCodes.map((code) => {
        switch (code.toUpperCase()) {
          case 'US':
            return CountryCode.Us;
          case 'CA':
            return CountryCode.Ca;
          case 'GB':
            return CountryCode.Gb;
          case 'IE':
            return CountryCode.Ie;
          case 'FR':
            return CountryCode.Fr;
          case 'ES':
            return CountryCode.Es;
          case 'NL':
            return CountryCode.Nl;
          case 'DE':
            return CountryCode.De;
          default:
            return CountryCode.Us;
        }
      }) as CountryCode[];

      const response = await this.client.institutionsGetById({
        institution_id: institutionId,
        country_codes: plaidCountryCodes,
      });

      const i = response.data.institution;
      return response.data.institution.country_codes.map((country) => ({
        institutionId: i.institution_id,
        name: i.name,
        key: `${country}_${i.name}`.toLowerCase(),
        ...(i.url && { website: i.url }),
        ...(i.logo && { logoUrl: i.logo }),
        countryCode: country,
        bankCodes: {
          ...(i.routing_numbers[0] ? { routing: i.routing_numbers[0] } : {}),
          ...(i.routing_numbers[1] ? { local: i.routing_numbers[1] } : {}),
        },
        rawData: i,
      }));
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Get item details (institution info) for a connected Plaid item
  async getItemDetails({ accessToken }: { accessToken: string }): Promise<{
    itemId: string;
    institutionId: string;
    institutionName?: string;
    metadata?: Record<string, any>;
  }> {
    try {
      const response = await this.client.itemGet({ access_token: accessToken });
      const item = response.data.item;

      return {
        itemId: item.item_id,
        institutionId: item.institution_id!,
        institutionName: item.institution_name || undefined,
        metadata: {
          availableProducts: item.available_products,
          billedProducts: item.billed_products,
          consentExpirationTime: item.consent_expiration_time,
          updateType: item.update_type,
          rawData: item,
        },
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private mapAuthGetResponse(data: AuthGetResponse): ProviderAccount[] {
    const accountNumberLookup = new Map();

    for (const [numberType, accounts] of Object.entries(data.numbers)) {
      for (const account of accounts) {
        accountNumberLookup.set(account.account_id, {
          numberType,
          ...account,
        });
      }
    }

    return data.accounts
      .filter((account) => account.name && account.balances.iso_currency_code)
      .map((account) => {
        const numberData = accountNumberLookup.get(account.account_id);
        const currency =
          account.balances.iso_currency_code || account.balances.unofficial_currency_code;
        const type = mapPlaidAccountType({
          type: account.type,
          subtype: account.subtype || undefined,
        });
        return {
          accountId: account.account_id,
          institutionId: data.item.institution_id || undefined,
          displayName: account.name,
          officialName: account.official_name || account.name,
          accountNumber: numberData?.account || numberData?.iban,
          type,
          mask: account.mask || undefined,
          currencyCode: currency!,
          balance: account.balances,
          rawData: {
            account,
            numberData,
          },
        };
      });
  }

  handleError(error: any): ProviderError {
    if (error && typeof error === 'object' && 'error_code' in error) {
      return {
        code: error.error_code,
        message: error.error_message,
        displayMessage: this.getDisplayMessage(error.error_code),
        retryable: this.isRetryableError(error.error_code),
      };
    }

    // TODO: Add notification later
    return {
      code: 'PLAID_UNKNOWN_ERROR',
      message: error.message || 'Unknown Plaid error',
      displayMessage: 'An unexpected error occurred. Please try again.',
      retryable: false,
    };
  }

  private isRetryableError(errorCode: string): boolean {
    const retryableCodes = ['RATE_LIMIT_EXCEEDED', 'INTERNAL_SERVER_ERROR', 'PLANNED_MAINTENANCE'];
    return retryableCodes.includes(errorCode);
  }

  private getDisplayMessage(errorCode: string): string {
    const messages: Record<string, string> = {
      RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again later.',
      INVALID_CREDENTIALS: 'Invalid login credentials. Please check and try again.',
      ITEM_LOGIN_REQUIRED: 'Please reconnect your bank account.',
      INSUFFICIENT_CREDENTIALS: 'Additional verification required.',
      ITEM_LOCKED: 'Your account is temporarily locked. Please try again later.',
      USER_SETUP_REQUIRED: 'Please complete account setup with your bank.',
      MFA_NOT_SUPPORTED: 'Multi-factor authentication not supported for this account.',
    };

    return (
      messages[errorCode] || 'An error occurred while connecting to your bank. Please try again.'
    );
  }
}
