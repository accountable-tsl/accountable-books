import { useMutation } from '@tanstack/react-query';

import { handleLogin, signup } from '../api';

export const useLogin = () => {
  return useMutation({
    mutationFn: handleLogin,
  });
};

export const useSignup = () => {
  return useMutation({
    mutationFn: signup,
  });
};
