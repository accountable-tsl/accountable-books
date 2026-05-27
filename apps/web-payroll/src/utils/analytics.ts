/**
 * Simple analytics utility for tracking usage metrics
 * Privacy-friendly: Only tracks events, no PII, no cookies
 */

type AnalyticsEvent =
  | { type: 'page_view'; path: string }
  | { type: 'payroll_run_created'; employeeCount: number }
  | { type: 'payroll_run_finalized'; employeeCount: number }
  | { type: 'employee_added' }
  | { type: 'sample_data_loaded' }
  | { type: 'export_csv' }
  | { type: 'error'; error: string; context?: Record<string, unknown> };

const ANALYTICS_ENABLED = import.meta.env.PROD;
const API_URL =
  import.meta.env.VITE_API_URL || 'https://api-staging.getaccountable.com';

/**
 * Track an analytics event
 * Only sends in production, fails silently if API is unavailable
 */
export function track(event: AnalyticsEvent): void {
  if (!ANALYTICS_ENABLED) {
    return;
  }

  // Send asynchronously, don't block the UI
  fetch(`${API_URL}/analytics/track`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...event,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      // No cookies, no PII - just events
    }),
  }).catch(() => {
    // Silently fail - analytics should never break the app
  });
}

/**
 * Track page views (call in router)
 */
export function trackPageView(path: string): void {
  track({ type: 'page_view', path });
}

/**
 * Track payroll-specific events
 */
export const payrollAnalytics = {
  runCreated: (employeeCount: number) =>
    track({ type: 'payroll_run_created', employeeCount }),

  runFinalized: (employeeCount: number) =>
    track({ type: 'payroll_run_finalized', employeeCount }),

  employeeAdded: () => track({ type: 'employee_added' }),

  sampleDataLoaded: () => track({ type: 'sample_data_loaded' }),

  exportCsv: () => track({ type: 'export_csv' }),

  error: (error: string, context?: Record<string, unknown>) =>
    track({ type: 'error', error, context }),
};
