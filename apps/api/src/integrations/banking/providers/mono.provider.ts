import axios from 'axios';
import { BankingProvider, type ProviderError } from '../types/base.js';
import { ENV } from 'src/config/env.js';

export class MonoProvider extends BankingProvider {
  readonly key = 'mono';
  readonly name = 'Mono';

  private readonly secretKey = ENV.MONO_SECRET_KEY || '';

  async createLinkToken({
    userId,
    companyId,
  }: {
    userId: string;
    companyId: string;
  }): Promise<string> {
    // Mono uses a widget-based approach, so we return configuration data
    // The frontend will use this to initialize the Mono widget
    return JSON.stringify({
      key: this.secretKey,
      scope: 'auth',
      data: {
        customer: { id: userId },
        meta: { companyId },
      },
      onSuccess: `${ENV.BACKEND_URL}/banking/mono/callback`,
      onClose: `${ENV.FRONTEND_URL}/banking/cancelled`,
    });
  }

  async exchangeToken({
    publicToken,
  }: {
    publicToken: string;
  }): Promise<{ accessToken: string; itemId?: string }> {
    try {
      const response = await axios.post(
        'https://api.withmono.com/v2/accounts/auth',
        { publicToken },
        {
          headers: {
            'mono-sec-key': this.secretKey,
            'Content-Type': 'application/json',
          },
        },
      );

      if (response.data.status !== 'successful') {
        throw new Error(`Mono exchange failed: ${response.data.message}`);
      }

      const accountId = response.data.data.id;
      return {
        accessToken: accountId,
        itemId: accountId,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  handleError(error: any): ProviderError {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;

      return {
        code: `MONO_${status || 'UNKNOWN'}`,
        message: message,
        displayMessage: this.getMonoDisplayMessage(status),
        retryable: this.isRetryableError(status),
      };
    }

    return {
      code: 'MONO_UNKNOWN_ERROR',
      message: error.message || 'Unknown Mono error',
      displayMessage: 'An error occurred while connecting to your bank. Please try again.',
      retryable: false,
    };
  }

  private isRetryableError(status?: number): boolean {
    return status === 429 || status === 500 || status === 502 || status === 503;
  }

  private getMonoDisplayMessage(status?: number): string {
    const messages: Record<number, string> = {
      400: 'Invalid request. Please check your information and try again.',
      401: 'Authentication failed. Please reconnect your bank account.',
      403: 'Access denied. Please contact support.',
      404: 'Bank account not found. Please reconnect.',
      429: 'Too many requests. Please try again later.',
      500: 'Bank server error. Please try again later.',
      502: 'Bank service unavailable. Please try again later.',
      503: 'Bank service temporarily unavailable. Please try again later.',
    };

    return (
      messages[status || 0] || 'An error occurred while connecting to your bank. Please try again.'
    );
  }
}
