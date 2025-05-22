import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { AuthStore, SessionStore } from "./types";

export const authStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      isSessionValid: false,
    }),
    {
      name: "user-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        user: s.user
          ? {
              id: s.user.id,
              email: s.user.email,
              firstname: s.user.firstname,
              lastname: s.user.lastname,
            }
          : null,
      }),
    }
  )
);

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
