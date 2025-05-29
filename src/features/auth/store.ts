import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { AuthStore, SessionStore } from "./types";

export const authStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
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

export const sessionStore = create<SessionStore>((set) => ({
  checkingSession: true, // true initially
  setCheckingSession: (value) => set({ checkingSession: value }),
}));
