const backendUrl = import.meta.env.VITE_BACKEND_URL;

export const getBankLogoUrl = (bankCode: string) => {
  return `${backendUrl}/${bankCode}.svg`;
};
