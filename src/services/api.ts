/**
 * API Client — Axios instance with auth token interceptor.
 *
 * All backend requests go through this client.
 * The Bearer token is automatically attached from SecureStore.
 */

import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Use your machine's local IP so the phone on the same WiFi can connect.
// Change this to your actual backend URL.
export const BASE_URL = 'http://192.168.1.9:8000/api/v1';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

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
    }
    return Promise.reject(error);
  }
);

export default api;
