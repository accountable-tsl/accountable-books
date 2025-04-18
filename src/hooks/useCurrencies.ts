import { fetchCurrencies } from "@/services/currencyServices";
import { useQuery } from "@tanstack/react-query";

export const useCurrencies = () => {
  return useQuery({
    queryKey: ["currencies"],
    queryFn: fetchCurrencies,
    staleTime: 1000 * 60 * 60 * 24,
  });
};
