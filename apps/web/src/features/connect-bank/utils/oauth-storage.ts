interface PlaidOAuthState {
  linkToken: string;
  companyId: string;
  userId: string;
  provider: string;
  countryCode: string;
  timestamp: number;
  // Store the original URL to redirect back to after OAuth
  returnUrl?: string;
}

const STORAGE_KEY = 'plaid_oauth_state';
const STATE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Utility for managing Plaid OAuth state persistence across redirects
 *
 * When Plaid redirects to an OAuth institution, the user leaves our app.
 * This utility stores necessary context (link token, user info) so we can
 * reinitialize Plaid Link when the user returns from the bank's website.
 */
export const plaidOAuthStorage = {
  /**
   * Save OAuth state before Plaid Link redirects to bank
   */
  save: (state: Omit<PlaidOAuthState, 'timestamp'>): void => {
    try {
      const stateWithTimestamp: PlaidOAuthState = {
        ...state,
        timestamp: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateWithTimestamp));
    } catch (error) {
      console.error('Failed to save Plaid OAuth state:', error);
    }
  },

  /**
   * Retrieve OAuth state when user returns from bank
   * Returns null if state is missing or expired
   */
  retrieve: (): PlaidOAuthState | null => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;

      const state: PlaidOAuthState = JSON.parse(stored);

      // Check if state has expired (older than 30 minutes)
      if (Date.now() - state.timestamp > STATE_TIMEOUT_MS) {
        console.warn('Plaid OAuth state expired, clearing storage');
        plaidOAuthStorage.clear();
        return null;
      }

      return state;
    } catch (error) {
      console.error('Failed to retrieve Plaid OAuth state:', error);
      plaidOAuthStorage.clear();
      return null;
    }
  },

  /**
   * Clear stored OAuth state
   */
  clear: (): void => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear Plaid OAuth state:', error);
    }
  },

  /**
   * Check if there's valid OAuth state stored
   */
  hasState: (): boolean => {
    return plaidOAuthStorage.retrieve() !== null;
  },
};
