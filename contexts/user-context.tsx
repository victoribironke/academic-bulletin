"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { User, hasPermission, hasAnyPermission, Permission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

interface UserContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  isLoading: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    let mounted = true;

    const fetchUser = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const response = await fetch(`/api/users/${user.id}`);
          if (response.ok) {
            const fullUser = await response.json();
            if (mounted) {
              setCurrentUser(fullUser);
            }
          } else {
            if (mounted) setCurrentUser(null);
          }
        } else {
          if (mounted) setCurrentUser(null);
        }
      } catch (error) {
        console.error("Failed to fetch user:", error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    fetchUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setCurrentUser(null);
      } else if (event === "SIGNED_IN") {
        fetchUser();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase.auth]);

  return (
    <UserContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        isLoading,
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
