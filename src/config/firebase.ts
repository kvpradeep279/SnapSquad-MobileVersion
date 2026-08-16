/**
 * Firebase Configuration
 * 
 * This file initializes Firebase and configures Google Sign-In.
 * It should be imported early in the application lifecycle (e.g., App.tsx).
 */

import { configureGoogleSignIn } from '../services/auth';

// Web Client ID from Firebase Console -> Authentication -> Sign-in method -> Google
const GOOGLE_WEB_CLIENT_ID = '368655747542-3170itgg73pgavu0i73r6u4mutao9o3u.apps.googleusercontent.com';

/**
 * Initialize all Firebase and related auth services.
 */
export function initializeFirebase() {
  // Configure Google Sign-In with the Web Client ID
  configureGoogleSignIn(GOOGLE_WEB_CLIENT_ID);
  
  console.log('[Firebase] Initialized with Google Web Client ID');
}
