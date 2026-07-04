/**
 * Rooms Service — full API layer for V2 collaborative rooms.
 *
 * Covers: room CRUD, join flow, photo upload, pipeline status, clusters.
 * All calls go through the shared Axios instance (auth token auto-attached).
 */

import api from './api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Room {
  id: string;
  name: string;
  room_type: 'shared' | 'event';
  status: string;
  created_by: string;
  shadow_album_id: string | null;
  member_count: number;
  photo_count: number;
  expires_at: string | null;
  created_at: string;
  my_role: 'creator' | 'member';
  my_status: 'pending' | 'approved' | 'rejected';
}

export interface RoomMember {
  user_id: string;
  display_name: string;
  role: 'creator' | 'member' | 'uploader';
  status: 'pending' | 'approved' | 'rejected';
  joined_at: string;
}

export interface RoomPhoto {
  id: string;
  encrypted_blob_url: string;
  face_count: number;
  original_filename: string;
  uploader_id: string;
  uploader_name: string;
  created_at: string;
}

export interface RoomCluster {
  id: string;
  cluster_label: number;
  display_name: string;
  face_count: number;
  representative_face?: {
    photo_id: string;
    bbox: [number, number, number, number];
  };
}

export interface RoomJob {
  job_id: string;
  uploader_id: string | null;
  status: string;
  stage: string;
  created_at: string | null;
}

export interface RoomStatus {
  room_id: string;
  name: string;
  room_type: string;
  my_role: string;
  my_status: string;
  status: string;
  photo_count: number;
  cluster_count: number;
  album_id?: string;
  jobs: RoomJob[];
}

export interface CreateRoomResult {
  room_id: string;
  room_name: string;
  room_type: string;
  shadow_album_id: string;
  expires_at: string;
  qr_payload: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Room CRUD
// ─────────────────────────────────────────────────────────────────────────────

/** Create a new room. Returns QR payload + room_id. */
export async function createRoom(
  name: string,
  room_type: 'shared' | 'event' = 'shared'
): Promise<CreateRoomResult> {
  const res = await api.post('/rooms/', { name, room_type });
  return res.data;
}

/** List all rooms where the current user is an approved member. */
export async function listMyRooms(): Promise<Room[]> {
  const res = await api.get('/rooms/');
  return res.data;
}

/** Get a single room's detail. */
export async function getRoom(roomId: string): Promise<Room> {
  const res = await api.get(`/rooms/${roomId}`);
  return res.data;
}

/** Get basic room info (name, type) without needing to be a member. */
export async function getRoomBasicInfo(roomId: string): Promise<{ id: string; name: string; room_type: string }> {
  const res = await api.get(`/rooms/${roomId}/info`);
  return res.data;
}

/** Creator only: delete room and all its data. */
export async function deleteRoom(roomId: string): Promise<void> {
  await api.delete(`/rooms/${roomId}`);
}

/** Get QR payload for a room (creator only). */
export async function getRoomQrPayload(
  roomId: string
): Promise<{ qr_payload: string; room_id: string; room_name: string }> {
  const res = await api.get(`/rooms/${roomId}/qr`);
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Join Flow
// ─────────────────────────────────────────────────────────────────────────────

/** Request to join a room (after scanning QR). Idempotent. */
export async function requestJoin(
  roomId: string,
  requestedRole: 'member' | 'uploader' = 'member'
): Promise<{ status: string; message: string }> {
  const res = await api.post(`/rooms/${roomId}/request-join`, { requested_role: requestedRole });
  return res.data;
}

/** Creator only: change the role of an approved member. */
export async function setMemberRole(
  roomId: string,
  targetUserId: string,
  role: 'member' | 'uploader'
): Promise<{ success: boolean; old_role: string; new_role: string }> {
  const res = await api.post(`/rooms/${roomId}/members/${targetUserId}/set-role`, { role });
  return res.data;
}

/** Creator only: list all pending join requests. */
export async function listPendingRequests(roomId: string): Promise<RoomMember[]> {
  const res = await api.get(`/rooms/${roomId}/requests`);
  return res.data;
}

/** Creator only: approve a pending join request. */
export async function approveMember(
  roomId: string,
  targetUserId: string
): Promise<{ success: boolean; message: string }> {
  const res = await api.post(`/rooms/${roomId}/members/${targetUserId}/approve`);
  return res.data;
}

/** Creator only: reject a pending join request. */
export async function rejectMember(
  roomId: string,
  targetUserId: string
): Promise<{ success: boolean; message: string }> {
  const res = await api.post(`/rooms/${roomId}/members/${targetUserId}/reject`);
  return res.data;
}

/** Leave a room (member only, creator cannot leave). */
export async function leaveRoom(
  roomId: string
): Promise<{ success: boolean; message: string }> {
  const res = await api.delete(`/rooms/${roomId}/leave`);
  return res.data;
}

/** Creator only: remove a member and their photos from the room. */
export async function removeMember(
  roomId: string,
  targetUserId: string
): Promise<{ success: boolean; message: string }> {
  const res = await api.delete(`/rooms/${roomId}/members/${targetUserId}`);
  return res.data;
}

/** List all approved members of a room. */
export async function listMembers(roomId: string): Promise<RoomMember[]> {
  const res = await api.get(`/rooms/${roomId}/members`);
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Photos & Pipeline
// ─────────────────────────────────────────────────────────────────────────────

/** List all photos in a room. */
export async function listRoomPhotos(roomId: string): Promise<RoomPhoto[]> {
  const res = await api.get(`/rooms/${roomId}/photos`);
  return res.data;
}

/** Manually re-trigger the clustering pipeline for a room. */
export async function triggerRoomProcessing(
  roomId: string
): Promise<{ message: string; job_id?: string; album_id?: string }> {
  const res = await api.post(`/rooms/${roomId}/process`);
  return res.data;
}

/** Poll the pipeline status for a room. */
export async function getRoomStatus(roomId: string): Promise<RoomStatus> {
  const res = await api.get(`/rooms/${roomId}/status`);
  return res.data;
}

/** Get all face clusters for a room. */
export async function getRoomClusters(roomId: string) {
  const response = await api.get(`/rooms/${roomId}/clusters`);
  return response.data;
}

export async function findMeInRoom(roomId: string, embedding: number[]) {
  const response = await api.post(`/rooms/${roomId}/find-me`, { embedding });
  return response.data;
}

/**
 * Upload photos to a room.
 * files: array of { uri, name, type }
 * embeddings: per-photo array of face embedding arrays
 * faceCounts: per-photo face count
 */
export async function uploadRoomPhotos(
  roomId: string,
  files: Array<{ uri: string; name: string; type: string }>,
  embeddings: number[][][] = [],
  faceCounts: number[] = [],
  bboxes: number[][][] = []
): Promise<{ uploaded: number; photos: Array<{ photo_id: string; blob_key: string }>; job_id: string | null }> {
  const formData = new FormData();
  for (const f of files) {
    formData.append('files', { uri: f.uri, name: f.name, type: f.type } as any);
  }
  formData.append('embeddings_json', JSON.stringify(embeddings));
  formData.append('face_counts_json', JSON.stringify(faceCounts));
  formData.append('bboxes_json', JSON.stringify(bboxes));

  const res = await api.post(`/rooms/${roomId}/photos/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function deleteRoomPhoto(roomId: string, photoId: string): Promise<void> {
  await api.delete(`/rooms/${roomId}/photos/${photoId}`);
}

export async function deleteRoomCluster(roomId: string, clusterLabel: number): Promise<void> {
  await api.delete(`/rooms/${roomId}/clusters/${clusterLabel}`);
}
