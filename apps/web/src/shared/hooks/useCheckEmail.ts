import { useMutation } from '@tanstack/react-query';

import { checkEmail } from '@/shared/services/EmailServices';

export function useCheckEmail() {
  return useMutation({
    mutationFn: checkEmail,
  });
}
