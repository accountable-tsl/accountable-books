import api from "@/lib/axios";

export const handleBankAccountConnection = async ({
  companyId,
  provider,
  data,
}: {
  companyId: string;
  provider: "mono" | "plaid" | "okra" | "stripe";
  data: any;
}) => {
  const res = await api.post(`/api/${companyId}/bank-connections/`, {
    provider,
    data,
  });

  return res.data;
};

export const handleMonoConnection = async ({
  companyId,
  data,
}: {
  companyId: string;
  data: { code: string };
}) => {
  return handleBankAccountConnection({ companyId, provider: "mono", data });
};
