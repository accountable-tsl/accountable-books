export interface ApiResponse {
  success: boolean;
  message: string;
  data?: any;
  error?: string | Record<string, any> | string[];
}
