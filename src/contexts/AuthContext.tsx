"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/config";
import { getUser, createUser } from "@/lib/firebase/firestore";
import { UserProfile } from "@/lib/types";

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({
  user: null,
  profile: null,
  isAdmin: false,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    isAdmin: false,
    loading: true,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (user) => {
      if (user) {
        let profile = await getUser(user.uid);
        if (!profile) {
          await createUser({
            uid: user.uid,
            email: user.email || "",
            displayName: user.displayName || "",
            role: "facilitator",
          });
          profile = await getUser(user.uid);
        }
        setState({
          user,
          profile,
          isAdmin: profile?.role === "admin",
          loading: false,
        });
      } else {
        setState({ user: null, profile: null, isAdmin: false, loading: false });
      }
    });
    return () => unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
