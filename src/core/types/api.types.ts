export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  code?: string;
  error?: string | Record<string, any> | string[];
}
