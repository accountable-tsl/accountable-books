import { checkEmail, CheckEmailProps } from '@/shared/services/EmailServices';
import { ApiResponse } from '@/shared/types/core';
import { useMutation } from '@tanstack/react-query';

export function useCheckEmail() {
  return useMutation({
    mutationFn: checkEmail,
  });
}
