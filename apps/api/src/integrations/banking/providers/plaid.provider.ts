import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  type PlaidError,
  CountryCode,
  Products,
  type LinkTokenCreateRequest,
} from 'plaid';
import { BankingProvider, type ProviderError } from '../types/base.js';
import { ENV } from 'src/config/env.js';

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

  handleError(error: any): ProviderError {
    if (error && typeof error === 'object' && 'error_code' in error) {
      return {
        code: error.error_code,
        message: error.error_message,
        displayMessage: this.getDisplayMessage(error.error_code),
        retryable: this.isRetryableError(error.error_code),
      };
    }

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
