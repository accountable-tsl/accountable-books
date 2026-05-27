import { useMutation } from '@tanstack/react-query';

import { syncTransactions } from '../api';

export function useManualTransactionSync() {
  return useMutation({
    mutationFn: syncTransactions,
  });
}
