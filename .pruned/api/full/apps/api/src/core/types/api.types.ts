export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  code?: string;
  error?: string | Record<string, unknown> | string[];
}
