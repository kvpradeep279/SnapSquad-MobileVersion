import api from './api';

export interface ProfileStatusResponse {
  has_profile: boolean;
}

export const setProfileEmbedding = async (embedding: number[]): Promise<void> => {
  await api.post('/profile/me', { embedding });
};

export const getProfileStatus = async (): Promise<ProfileStatusResponse> => {
  const response = await api.get('/profile/me/status');
  return response.data;
};
