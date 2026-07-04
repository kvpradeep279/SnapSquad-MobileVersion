/**
 * Albums Service — create, list, upload photos, trigger processing, check status.
 */

import api from './api';

export interface Album {
  album_id: string;
  name: string;
  status: string;
  total_photos: number;
  total_faces: number;
  created_at: string;
  thumbnail_photo_id?: string | null;
}

/**
 * List all albums for the current user.
 */
export async function listAlbums(): Promise<Album[]> {
  const res = await api.get('/albums');
  return res.data;
}

export interface AlbumPhoto {
  photo_id: string;
  encrypted_blob_url: string;
  original_filename?: string;
}

/**
 * List all photos in an album.
 */
export async function getAlbumPhotos(albumId: string): Promise<AlbumPhoto[]> {
  const res = await api.get(`/albums/${albumId}/photos`);
  return res.data.photos;
}

/**
 * Rename an album.
 */
export async function renameAlbum(albumId: string, newName: string): Promise<void> {
  await api.patch(`/albums/${albumId}/rename`, { new_name: newName });
}

/**
 * Delete an entire album and all its data.
 */
export async function deleteAlbum(albumId: string): Promise<void> {
  await api.delete(`/albums/${albumId}`);
}

/**
 * Create a new album.
 */
export async function createAlbum(name: string): Promise<{ album_id: string; status: string }> {
  const res = await api.post('/albums', { name });
  return res.data;
}

export interface FacePayload {
  face_index: number;
  bbox: [number, number, number, number];
  det_score: number;
  embedding: number[];
}

/**
 * Upload a single photo with its face detections to an album.
 */
export async function uploadPhoto(
  albumId: string,
  photoUri: string,
  originalFilename: string,
  photoId: string,
  faces: FacePayload[]
): Promise<{ photo_id: string; faces_stored: number; status: string }> {
  const formData = new FormData();

  // Metadata JSON
  const metadata = JSON.stringify({
    photo_id: photoId,
    original_filename: originalFilename,
    faces,
  });
  formData.append('metadata', metadata);

  // Photo blob
  formData.append('encrypted_blob', {
    uri: photoUri,
    name: `${photoId}.jpg`,
    type: 'image/jpeg',
  } as any);

  const res = await api.post(`/albums/${albumId}/photos`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

/**
 * Trigger clustering on an album.
 */
export async function processAlbum(
  albumId: string
): Promise<{ album_id: string; job_id: string; status: string }> {
  const res = await api.post(`/albums/${albumId}/process`);
  return res.data;
}

/**
 * Check the processing status of an album.
 */
export async function getAlbumStatus(
  albumId: string
): Promise<{
  album_id: string;
  status: string;
  stage: string;
  total_photos: number;
  total_faces: number;
}> {
  const res = await api.get(`/albums/${albumId}/status`);
  return res.data;
}
