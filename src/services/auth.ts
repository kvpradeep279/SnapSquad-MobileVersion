/**
 * Auth Service — Firebase Authentication with Google Sign-In.
 *
 * ARCHITECTURE:
 *   Authentication is handled entirely by Firebase Auth on the client.
 *   The app uses Google Sign-In to authenticate, then sends the Firebase
 *   ID token to the backend for user creation/verification.
 *
 *   Flow:
 *   1. User taps "Sign in with Google"
 *   2. Google Sign-In returns a Google credential
 *   3. Credential is exchanged for a Firebase ID token
 *   4. Firebase ID token is sent to POST /auth/firebase on the backend
 *   5. Backend verifies token, creates/returns user profile
 *
 *   For all subsequent API calls, the Firebase ID token is used as the
 *   Bearer token (handled automatically by the api.ts interceptor).
 */

import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  User as FirebaseAuthTypesUser,
} from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import api from './api';

// ── Types ─────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  display_name?: string | null;
  photo_url?: string | null;
}

export interface AuthResult {
  success: boolean;
  error?: string;
}

// ── Google Sign-In Configuration ──────────────────────────────────

/**
 * Configure Google Sign-In.
 * Call this once during app initialization (e.g., in App.tsx or firebase.ts).
 *
 * The webClientId comes from Firebase Console → Authentication → Sign-in method
 * → Google → Web client ID (auto-created by Firebase).
 */
export function configureGoogleSignIn(webClientId: string) {
  GoogleSignin.configure({
    webClientId,
    offlineAccess: false,
  });
}

// ── Sign In ───────────────────────────────────────────────────────

/**
 * Sign in with Google.
 *
 * Triggers the native Google Sign-In prompt, exchanges the credential
 * for a Firebase auth session, then registers/logs in on the backend.
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  try {
    // Check if Google Play Services are available (Android)
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    // Trigger the native Google Sign-In prompt
    const response = await GoogleSignin.signIn();

    if (!response.data?.idToken) {
      return { success: false, error: 'Google Sign-In failed: no ID token received' };
    }

    // In v25+, the native bridge sometimes throws "accessToken cannot be empty".
    // We can fetch the accessToken explicitly using getTokens()
    const tokens = await GoogleSignin.getTokens();
    const googleCredential = GoogleAuthProvider.credential(response.data.idToken, tokens.accessToken);

    // Sign in to Firebase with the Google credential
    const authInstance = getAuth();
    const firebaseUserCredential = await signInWithCredential(authInstance, googleCredential);

    // Get the Firebase ID token
    const firebaseIdToken = await firebaseUserCredential.user.getIdToken();

    // Send the Firebase ID token to our backend to create/verify the user
    await api.post('/auth/firebase', { id_token: firebaseIdToken });

    return { success: true };
  } catch (err: any) {
    console.error('[Auth] Google Sign-In error:', err);

    // Handle specific error codes
    if (err.code === 'SIGN_IN_CANCELLED') {
      return { success: false, error: 'Sign-in was cancelled' };
    }
    if (err.code === 'IN_PROGRESS') {
      return { success: false, error: 'Sign-in is already in progress' };
    }
    if (err.code === 'PLAY_SERVICES_NOT_AVAILABLE') {
      return { success: false, error: 'Google Play Services not available' };
    }

    const msg = err.message || 'Sign-in failed';
    return { success: false, error: msg };
  }
}

// ── Sign Out ──────────────────────────────────────────────────────

/**
 * Sign out of Firebase and Google.
 */
export async function signOut(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Google Sign-In signOut can fail if not signed in — ignore
  }
  const authInstance = getAuth();
  await firebaseSignOut(authInstance);
}

// ── Token Retrieval ───────────────────────────────────────────────

/**
 * Get the current Firebase ID token.
 *
 * This is called by the API interceptor before every request.
 * Firebase automatically refreshes the token if it's expired.
 *
 * @param forceRefresh - Force a token refresh (default: false)
 * @returns The Firebase ID token string, or null if not signed in
 */
export async function getFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  const authInstance = getAuth();
  const user = authInstance.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

// ── Auth State ────────────────────────────────────────────────────

/**
 * Subscribe to Firebase auth state changes.
 *
 * @param callback - Called with the Firebase user (or null on sign-out)
 * @returns Unsubscribe function
 */
export function onAuthStateChanged(
  callback: (user: FirebaseAuthTypesUser | null) => void
): () => void {
  const authInstance = getAuth();
  return firebaseOnAuthStateChanged(authInstance, callback);
}

/**
 * Get the currently signed-in Firebase user.
 */
export function getCurrentUser(): FirebaseAuthTypesUser | null {
  const authInstance = getAuth();
  return authInstance.currentUser;
}

// ── Backend Profile ───────────────────────────────────────────────

/**
 * Fetch the current user's profile from the Plexida backend.
 */
export async function fetchMe(): Promise<UserProfile | null> {
  try {
    const res = await api.get('/auth/me');
    return res.data as UserProfile;
  } catch {
    return null;
  }
}

/**
 * Update username and/or display name on the backend.
 */
export async function updateProfile(
  payload: { username?: string; display_name?: string }
): Promise<{ success: boolean; error?: string; user?: UserProfile }> {
  try {
    const res = await api.patch('/auth/me', payload);
    return { success: true, user: res.data as UserProfile };
  } catch (err: any) {
    const msg = err.response?.data?.detail || 'Update failed';
    return { success: false, error: msg };
  }
}
