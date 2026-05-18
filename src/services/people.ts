import api from './api';

export interface PersonSummary {
  name: string;
  total_faces: number;
  thumbnail_album_id: string | null;
  thumbnail_photo_id: string | null;
  thumbnail_bbox: [number, number, number, number] | null;
}

export interface PersonPhoto {
  photo_id: string;
  album_id: string;
  cluster_label: number;
  encrypted_blob_url: string;
}

export async function getYourPeople(): Promise<PersonSummary[]> {
  const res = await api.get('/people');
  return res.data.people;
}

export async function getPersonPhotos(name: string): Promise<PersonPhoto[]> {
  const res = await api.get(`/people/${encodeURIComponent(name)}/photos`);
  return res.data.photos;
}
