"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { User, hasPermission, hasAnyPermission, Permission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { AuthChangeEvent } from "@supabase/supabase-js";

interface UserContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isFetching = React.useRef(false);

  const fetchUser = useCallback(async () => {
    if (isFetching.current) return;
    isFetching.current = true;
    try {
      const response = await fetch("/api/users/me", {
        headers: {
          "Cache-Control": "no-cache",
        },
      });

      if (response.ok) {
        const fullUser = await response.json();
        setCurrentUser(fullUser);
      } else {
        setCurrentUser(null);
        if (response.status === 401 || response.status === 403) {
          const supabase = createClient();
          await supabase.auth.signOut({ scope: "local" });
          if (typeof window !== "undefined") {
            window.location.assign("/login");
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch user:", error);
      setCurrentUser(null);
    } finally {
      setIsLoading(false);
      isFetching.current = false;
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    // Supabase fires INITIAL_SESSION straight after subscribing, which
    // triggers the first load of the user's profile.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === "SIGNED_OUT") {
        setCurrentUser(null);
        setIsLoading(false);
      } else if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "USER_UPDATED" ||
        event === "TOKEN_REFRESHED"
      ) {
        fetchUser();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchUser]);

  return (
    <UserContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        isLoading,
        refreshUser: fetchUser,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}

export function usePermission() {
  const { currentUser } = useUser();

  return {
    user: currentUser,
    hasPermission: (permission: Permission) => {
      return hasPermission(currentUser, permission);
    },
    hasAnyPermission: (permissions: Permission[]) => {
      return hasAnyPermission(currentUser, permissions);
    },
  };
}
