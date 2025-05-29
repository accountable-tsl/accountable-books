import { checkEmail, CheckEmailProps } from "@/services/EmailServices";
import { ServerResponseFormat } from "@/types/types";
import { useMutation } from "@tanstack/react-query";

export function useCheckEmail() {
  return useMutation({
    mutationFn: checkEmail,
  });
}
