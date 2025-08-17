export const usePasswordRules = (password: string) => {
  const rules = {
    minLength: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSymbol: /[!@#$%^&*]/.test(password),
  };
  const score = Object.values(rules).filter(Boolean).length;

  return { rules, score };
};
