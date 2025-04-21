export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string | Record<string, any> | string[];
}
