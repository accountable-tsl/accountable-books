import type { ReactNode } from 'react';
import * as Sentry from '@sentry/react';

import ErrorPage from './ErrorPage';

type SentryAppBoundaryProps = {
  children: ReactNode;
};

export function SentryAppBoundary({ children }: SentryAppBoundaryProps) {
  return (
    <Sentry.ErrorBoundary
      fallback={
        <ErrorPage
          type="default"
          message="We're sorry, but something unexpected happened. The error has been reported."
          showHomeLink
          showSupport
        />
      }
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
