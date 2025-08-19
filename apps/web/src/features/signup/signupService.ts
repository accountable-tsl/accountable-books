import axios from '@/lib/axios';
import type { ApiResponse } from '@/shared/types/core';
import { type NewCompany, type NewFirm, type NewUser } from './signupTypes';

export const submitSignup = async (data: {
  user: NewUser;
  company: NewCompany;
  firm?: NewFirm;
}): Promise<ApiResponse<any>> => {
  const res = await axios.post('/api/signup', { data });
  return res.data;
};
