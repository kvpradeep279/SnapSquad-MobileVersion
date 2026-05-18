/**
 * AuthContext — Global authentication state.
 *
 * Provides { isLoggedIn, isLoading, user, signIn, signUp, signOut, refreshUser } to all screens.
 * On app launch, checks SecureStore for an existing token and fetches /auth/me.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import * as auth from '../services/auth';
import { UserProfile } from '../services/auth';

interface AuthState {
  isLoggedIn: boolean;
  isLoading: boolean;
  error: string | null;
  user: UserProfile | null;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, username: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  clearError: () => void;
  refreshUser: () => Promise<void>;
  updateUser: (u: UserProfile) => void;
}

const AuthContext = createContext<AuthState>({} as AuthState);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);

  // On mount: check token + fetch profile
  useEffect(() => {
    (async () => {
      const token = await auth.getStoredToken();
      if (token) {
        setIsLoggedIn(true);
        const profile = await auth.fetchMe();
        if (profile) setUser(profile);
      }
      setIsLoading(false);
    })();
  }, []);

  const signIn = async (email: string, password: string): Promise<boolean> => {
    setError(null);
    const result = await auth.login(email, password);
    if (result.success) {
      setIsLoggedIn(true);
      // Fetch profile after login
      const profile = await auth.fetchMe();
      if (profile) setUser(profile);
      return true;
    }
    setError(result.error || 'Login failed');
    return false;
  };

  const signUp = async (email: string, username: string, password: string): Promise<boolean> => {
    setError(null);
    const result = await auth.signup(email, username, password);
    if (result.success) {
      setIsLoggedIn(true);
      const profile = await auth.fetchMe();
      if (profile) setUser(profile);
      return true;
    }
    setError(result.error || 'Signup failed');
    return false;
  };

  const signOut = async () => {
    await auth.logout();
    setIsLoggedIn(false);
    setUser(null);
  };

  const refreshUser = async () => {
    const profile = await auth.fetchMe();
    if (profile) setUser(profile);
  };

  const updateUser = (u: UserProfile) => setUser(u);

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider value={{ isLoggedIn, isLoading, error, user, signIn, signUp, signOut, clearError, refreshUser, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
