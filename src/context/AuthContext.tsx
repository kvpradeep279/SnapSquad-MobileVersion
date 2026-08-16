/**
 * AuthContext — Global authentication state powered by Firebase Auth.
 *
 * Provides { isLoggedIn, isLoading, user, signInWithGoogle, signOut, refreshUser }
 * to all screens.
 *
 * Uses Firebase's onAuthStateChanged listener to automatically track login state.
 * No manual token management needed — Firebase handles token persistence and refresh.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import * as auth from '../services/auth';
import { UserProfile } from '../services/auth';

interface AuthState {
  isLoggedIn: boolean;
  isLoading: boolean;
  error: string | null;
  user: UserProfile | null;
  signInWithGoogle: () => Promise<boolean>;
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

  // Listen to Firebase auth state changes
  useEffect(() => {
    // Set up the 401 handler for API calls
    import('../services/api').then(({ setOnUnauthorized }) => {
      setOnUnauthorized(() => {
        // Firebase token was rejected by backend — sign out
        auth.signOut();
      });
    });

    // Firebase auth state listener — fires on sign-in, sign-out, and token refresh
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in — fetch their Plexida profile from the backend
        setIsLoggedIn(true);
        try {
          const profile = await auth.fetchMe();
          if (profile) setUser(profile);
        } catch {
          // Backend might not be reachable yet — that's ok, profile will load on retry
        }
      } else {
        // User is signed out
        setIsLoggedIn(false);
        setUser(null);
      }
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = async (): Promise<boolean> => {
    setError(null);
    const result = await auth.signInWithGoogle();
    if (result.success) {
      // onAuthStateChanged will fire and update isLoggedIn + user
      // But let's also eagerly fetch the profile
      const profile = await auth.fetchMe();
      if (profile) setUser(profile);
      return true;
    }
    setError(result.error || 'Sign-in failed');
    return false;
  };

  const handleSignOut = async () => {
    await auth.signOut();
    // onAuthStateChanged will fire and clear isLoggedIn + user
  };

  const refreshUser = async () => {
    const profile = await auth.fetchMe();
    if (profile) setUser(profile);
  };

  const updateUser = (u: UserProfile) => setUser(u);

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider value={{
      isLoggedIn,
      isLoading,
      error,
      user,
      signInWithGoogle,
      signOut: handleSignOut,
      clearError,
      refreshUser,
      updateUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
