/**
 * Clusters Service — fetch, rename, merge, eject, download.
 */

import api from './api';

export interface ClusterInfo {
  cluster_label: number;
  display_name: string;
  face_count: number;
  photo_count?: number;
  representative_face?: {
    photo_id: string;
    bbox: [number, number, number, number];
  };
  is_me?: boolean;
}

export interface ClustersResponse {
  album_id: string;
  clusters: ClusterInfo[];
  unidentified_count: number;
}

/**
 * List all face clusters for an album.
 */
export async function getClusters(albumId: string): Promise<ClustersResponse> {
  const res = await api.get(`/albums/${albumId}/clusters`);
  return res.data;
}

/**
 * Get photos belonging to a specific cluster.
 */
export async function getClusterPhotos(
  albumId: string,
  clusterLabel: number
): Promise<{
  album_id: string;
  cluster_label: number;
  photo_urls: Array<{
    photo_id: string;
    encrypted_blob_url: string;
    faces_in_cluster: number;
    face_ids: string[];
  }>;
}> {
  const res = await api.get(`/albums/${albumId}/clusters/${clusterLabel}/photos`);
  return res.data;
}

/**
 * Rename a cluster's display name.
 */
export async function renameCluster(
  albumId: string,
  clusterLabel: number,
  newName: string
): Promise<void> {
  await api.patch(`/albums/${albumId}/clusters/${clusterLabel}/rename`, {
    new_name: newName,
  });
}

/**
 * Delete a cluster entirely, moving all its faces to unidentified.
 */
export async function deleteCluster(
  albumId: string,
  clusterLabel: number
): Promise<void> {
  await api.delete(`/albums/${albumId}/clusters/${clusterLabel}`);
}

/**
 * Merge two clusters (source into target).
 */
export async function mergeClusters(
  albumId: string,
  sourceLabel: number,
  targetLabel: number
): Promise<void> {
  await api.post(`/albums/${albumId}/clusters/merge`, {
    source_cluster_label: sourceLabel,
    target_cluster_label: targetLabel,
  });
}

/**
 * Eject a face from its cluster (moves to unidentified).
 * V1: Ejected by face detection ID.
 */
export async function ejectFace(
  albumId: string,
  clusterLabel: number,
  faceDetectionId: string
): Promise<void> {
  await api.post(`/albums/${albumId}/clusters/${clusterLabel}/eject_face`, {
    face_detection_id: faceDetectionId,
  });
}

// ── Face Triage Override Endpoints ─────────────────────────────────────

/**
 * Hard delete a single face detection.
 */
export async function deleteFace(
  albumId: string,
  faceId: string
): Promise<void> {
  await api.delete(`/albums/${albumId}/faces/${faceId}`);
}

/**
 * Merge a single face into an existing cluster.
 */
export async function mergeFace(
  albumId: string,
  faceId: string,
  targetClusterLabel: number
): Promise<void> {
  await api.patch(`/albums/${albumId}/faces/${faceId}/merge`, {
    target_cluster_label: targetClusterLabel,
  });
}

/**
 * Promote a single face to a brand new cluster.
 */
export async function createClusterFromFace(
  albumId: string,
  faceId: string,
  newName: string
): Promise<{ new_cluster_label: number }> {
  const res = await api.post(`/albums/${albumId}/faces/${faceId}/create_cluster`, {
    new_name: newName,
  });
  return res.data;
}

/**
 * Eject multiple photos from a cluster.
 */
export async function ejectPhotos(
  albumId: string,
  clusterLabel: number,
  photoIds: string[]
): Promise<void> {
  await api.post(`/albums/${albumId}/clusters/${clusterLabel}/eject`, {
    photo_ids: photoIds,
  });
}

/**
 * Delete multiple photos entirely from an album.
 */
export async function deletePhotos(
  albumId: string,
  photoIds: string[]
): Promise<{ success: boolean; deleted_count: number; album_deleted: boolean }> {
  // Axios delete with body requires 'data'
  const res = await api.delete(`/albums/${albumId}/photos`, {
    data: { photo_ids: photoIds },
  });
  return res.data;
}

export interface UnidentifiedFace {
  photo_id: string;
  bbox: [number, number, number, number];
  face_detection_id: string;
}

/**
 * Get all unidentified faces for an album.
 */
export async function getUnidentifiedFaces(albumId: string): Promise<UnidentifiedFace[]> {
  const res = await api.get(`/albums/${albumId}/clusters/-1/faces`);
  return res.data.faces;
}

/**
 * Promote selected unidentified faces to a named cluster.
 */
export async function promoteUnidentifiedFaces(
  albumId: string,
  photoIds: string[],
  newName: string
): Promise<{ success: boolean; faces_promoted: number; cluster_label: number }> {
  const res = await api.post(`/albums/${albumId}/clusters/-1/promote`, {
    photo_ids: photoIds,
    new_name: newName,
  });
  return res.data;
}
