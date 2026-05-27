import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  billingOverviewQueryKey,
  billingPlanManagementSnapshotQueryKey,
  changeBillingPlan,
  createBillingPlanCheckoutSession,
  fetchBillingOverview,
  fetchBillingPlanManagementSnapshot,
} from '../api';

import type {
  ChangeBillingPlanRequest,
  CreateBillingPlanCheckoutSessionRequest,
} from './types';

export function useBillingOverview(options: {
  companyId?: string | null;
  enabled?: boolean;
}) {
  const { companyId, enabled = true } = options;

  return useQuery({
    queryKey: billingOverviewQueryKey(companyId),
    queryFn: async () => {
      if (!companyId) {
        throw new Error('Company ID is required to fetch billing overview');
      }

      return fetchBillingOverview({ companyId });
    },
    staleTime: 60_000,
    enabled: Boolean(companyId) && enabled,
  });
}

export function useBillingPlanManagementSnapshot(options: {
  companyId?: string | null;
  enabled?: boolean;
}) {
  const { companyId, enabled = true } = options;

  return useQuery({
    queryKey: billingPlanManagementSnapshotQueryKey(companyId),
    queryFn: async () => {
      if (!companyId) {
        throw new Error(
          'Company ID is required to fetch the billing plan snapshot',
        );
      }

      return fetchBillingPlanManagementSnapshot({ companyId });
    },
    staleTime: 30_000,
    enabled: Boolean(companyId) && enabled,
  });
}

export function useChangeBillingPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ChangeBillingPlanRequest) => changeBillingPlan(input),
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({
        queryKey: billingOverviewQueryKey(variables.companyId),
      });
      queryClient.invalidateQueries({
        queryKey: billingPlanManagementSnapshotQueryKey(variables.companyId),
      });
    },
  });
}

export function useCreateBillingPlanCheckoutSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBillingPlanCheckoutSessionRequest) =>
      createBillingPlanCheckoutSession(input),
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({
        queryKey: billingOverviewQueryKey(variables.companyId),
      });
      queryClient.invalidateQueries({
        queryKey: billingPlanManagementSnapshotQueryKey(variables.companyId),
      });
    },
  });
}
