import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { AuthState, SessionStore } from "./types";

export const authStore = create<AuthState>()((set) => ({
  user: null,
  csrfToken: null,

  setUser: (user) => set({ user }),
  setCsrf: (csrfToken) => set({ csrfToken }),

  setAuth: (user, csrfToken) => {
    localStorage.setItem("wasAuthenticated", "true");
    set({ user, csrfToken });
  },
  clearAuth: () => set({ user: null, csrfToken: null }),

  // isSessionValid: false,
}));

export const sessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      checkingSession: false,
      sessionValid: null, // null (not checked), true (valid), false (invalid)
      failedAttempts: 0, // Track failed attempts
      setCheckingSession: (checking) => set({ checkingSession: checking }),
      setSessionValid: (valid) => set({ sessionValid: valid }),
      incrementFailedAttempts: () =>
        set((state) => ({ failedAttempts: state.failedAttempts + 1 })),
      resetFailedAttempts: () => set({ failedAttempts: 0 }),
    }),
    {
      name: "session-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        sessionValid: s.sessionValid,
        failedAttempts: s.failedAttempts,
      }),
    }
  )
);
