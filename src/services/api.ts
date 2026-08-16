/**
 * API Client — Axios instance with Firebase Auth token interceptor.
 *
 * All backend requests go through this client.
 * The Firebase ID token is automatically attached to every request.
 *
 * ENVIRONMENT CONFIGURATION:
 *   The API base URL is determined by the environment:
 *   - Development: Your local machine's IP (set in app.json → extra.apiUrl)
 *   - Production: Your Cloud Run URL
 */

import axios from 'axios';
import Constants from 'expo-constants';
import { getFirebaseIdToken } from './auth';

// Read API URL from app.json → extra.apiUrl, with a fallback for dev
const expoExtra = Constants.expoConfig?.extra ?? {};
export const BASE_URL: string =
  expoExtra.apiUrl || 'http://192.168.1.13:8000/api/v1';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 300000, // 5 minutes timeout for large photo batch uploads
  headers: {
    'Content-Type': 'application/json',
    'Connection': 'close' // Fixes RN dropping first multipart request
  },
});

let onUnauthorizedCallback: (() => void) | null = null;

export const setOnUnauthorized = (cb: () => void) => {
  onUnauthorizedCallback = cb;
};

// Attach Firebase ID token to every request automatically
api.interceptors.request.use(async (config) => {
  try {
    const token = await getFirebaseIdToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (err) {
    // If token retrieval fails, send request without auth header.
    // The backend will return 401, which is handled by the response interceptor.
    console.warn('[API] Failed to get Firebase token:', err);
  }
  return config;
});

// Handle 401 globally (token expired or invalid)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid — the AuthContext will handle redirect to login
      if (onUnauthorizedCallback) onUnauthorizedCallback();
    }
    return Promise.reject(error);
  }
);

export default api;
