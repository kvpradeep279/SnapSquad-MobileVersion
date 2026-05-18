/**
 * Auth Service — signup, login, logout, and token management.
 */

import * as SecureStore from 'expo-secure-store';
import api from './api';

export interface AuthResult {
  success: boolean;
  error?: string;
}

/**
 * Sign up a new user. Stores the JWT token on success.
 */
export async function signup(
  email: string,
  username: string,
  password: string
): Promise<AuthResult> {
  try {
    const res = await api.post('/auth/signup', { email, username, password });
    await SecureStore.setItemAsync('auth_token', res.data.access_token);
    return { success: true };
  } catch (err: any) {
    let msg = 'Signup failed';
    if (err.response?.data?.detail) {
      msg = Array.isArray(err.response.data.detail) 
        ? err.response.data.detail[0].msg 
        : err.response.data.detail;
    }
    return { success: false, error: msg };
  }
}

/**
 * Login with email + password. Stores the JWT token on success.
 */
export async function login(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    const res = await api.post('/auth/login', { email, password });
    await SecureStore.setItemAsync('auth_token', res.data.access_token);
    return { success: true };
  } catch (err: any) {
    let msg = 'Login failed';
    if (err.response?.data?.detail) {
      msg = Array.isArray(err.response.data.detail) 
        ? err.response.data.detail[0].msg 
        : err.response.data.detail;
    }
    return { success: false, error: msg };
  }
}

/**
 * Logout — clear the stored token.
 */
export async function logout(): Promise<void> {
  await SecureStore.deleteItemAsync('auth_token');
}

/**
 * Check if user is currently authenticated (has stored token).
 */
export async function getStoredToken(): Promise<string | null> {
  return SecureStore.getItemAsync('auth_token');
}

export interface UserProfile {
  id: string;
  email: string;
  username: string;
}

/**
 * Fetch the current user's profile from the server.
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
 * Update username and/or password.
 */
export async function updateProfile(
  payload: { username?: string; password?: string }
): Promise<{ success: boolean; error?: string; user?: UserProfile }> {
  try {
    const res = await api.patch('/auth/me', payload);
    return { success: true, user: res.data as UserProfile };
  } catch (err: any) {
    const msg = err.response?.data?.detail || 'Update failed';
    return { success: false, error: msg };
  }
}
