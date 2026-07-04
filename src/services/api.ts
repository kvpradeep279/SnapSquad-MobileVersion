/**
 * API Client — Axios instance with auth token interceptor.
 *
 * All backend requests go through this client.
 * The Bearer token is automatically attached from SecureStore.
 */

import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Use your machine's local IP so the phone on the same WiFi can connect.
// Replace this with your computer's local IP address
export const BASE_URL = 'http://192.168.1.5:8000/api/v1';

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

// Attach JWT token to every request automatically
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally (token expired)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired — the AuthContext will handle redirect to login
      SecureStore.deleteItemAsync('auth_token');
      if (onUnauthorizedCallback) onUnauthorizedCallback();
    }
    return Promise.reject(error);
  }
);

export default api;
