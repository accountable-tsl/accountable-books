import { checkEmail } from '@/shared/services/EmailServices';
import { useMutation } from '@tanstack/react-query';

export function useCheckEmail() {
  return useMutation({
    mutationFn: checkEmail,
  });
}
