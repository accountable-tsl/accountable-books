import { checkEmail, CheckEmailProps } from "@/services/EmailServices";
import { ApiResponse } from "@/types/types";
import { useMutation } from "@tanstack/react-query";

export function useCheckEmail() {
  return useMutation({
    mutationFn: checkEmail,
  });
}
