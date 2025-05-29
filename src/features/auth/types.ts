import { zEmail } from "@/types/types";
import { z } from "zod";

export const loginForm = z.object({
  email: zEmail,
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type LoginForm = z.infer<typeof loginForm>;

export interface AuthStore {
  user: any | null;
  setUser: (user: any | null) => void;
}

export interface SessionStore {
  checkingSession: boolean;
  setCheckingSession: (value: boolean) => void;
}
