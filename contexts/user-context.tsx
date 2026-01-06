"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { User, hasPermission, hasAnyPermission, Permission } from "@/lib/auth";

interface UserContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  availableUsers: User[];
  isLoading: boolean;
  refreshUsers: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUsers = useCallback(async () => {
    try {
      const response = await fetch("/api/users");
      if (response.ok) {
        const users = await response.json();
        setAvailableUsers(users);

        // If no current user is set, default to the first user
        if (!currentUser && users.length > 0) {
          // Try to restore from localStorage
          const savedUserId = localStorage.getItem("currentUserId");
          const savedUser = users.find((u: User) => u.id === savedUserId);
          setCurrentUser(savedUser || users[0]);
        }
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  // Persist current user selection to localStorage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem("currentUserId", currentUser.id);
    }
  }, [currentUser]);

  return (
    <UserContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        availableUsers,
        isLoading,
        refreshUsers,
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
