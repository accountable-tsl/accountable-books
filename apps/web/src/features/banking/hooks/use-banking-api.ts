import { useMutation } from '@tanstack/react-query';
import { createLinkToken, connectAccounts } from '@/features/banking/api';
import { toast } from 'sonner';

export const useCreateLinkToken = () => {
  return useMutation({
    mutationFn: createLinkToken,
    onError: () => {
      toast.error('Failed to create bank connection', {
        description: 'Please try again',
      });
    },
  });
};

export const useConnectAccounts = () => {
  return useMutation({
    mutationFn: connectAccounts,
    onSuccess: () => {
      toast.success('Bank account connected successfully!');
    },
    onError: (error: any) => {
      const errorData = error.response?.data?.error;
      const message = errorData?.displayMessage || errorData?.message || 'Connection failed';

      toast.error('Failed to connect bank account', {
        description: message,
      });
    },
  });
};
