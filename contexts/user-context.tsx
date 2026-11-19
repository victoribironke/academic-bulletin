"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { User, hasPermission, hasAnyPermission, Permission } from "@/lib/auth";
import { logOut } from "@/app/actions/auth";

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
        const data = await response.json().catch(() => ({}));
        if (data?.code === "MFA_REQUIRED") {
          // An admin whose sign-in needs its authenticator code (again).
          const here = `${window.location.pathname}${window.location.search}`;
          window.location.assign(`/verify?next=${encodeURIComponent(here)}`);
          return;
        }
        if (response.status === 401 || response.status === 403) {
          // Clears the session cookie and returns to /login.
          await logOut();
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

  // Load the signed-in user's profile once the app mounts. fetchUser only
  // sets state after its request returns.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUser();
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
