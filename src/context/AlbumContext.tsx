/**
 * AlbumContext — Global state for albums and upload progress.
 *
 * Provides:
 *   - albums: list fetched from server
 *   - currentAlbumId: the album being uploaded to
 *   - uploadProgress: {uploaded, total} tracking
 *   - actions: createAndSetAlbum, refreshAlbums, setProgress
 */

import React, { createContext, useCallback, useContext, useState } from 'react';
import * as albumsApi from '../services/albums';

export interface Album {
  album_id: string;
  name: string;
  status: string;
  total_photos: number;
  total_faces: number;
  created_at: string;
}

interface UploadProgress {
  uploaded: number;
  total: number;
}

interface AlbumState {
  albums: Album[];
  isLoading: boolean;
  currentAlbumId: string | null;
  uploadProgress: UploadProgress;
  refreshAlbums: () => Promise<void>;
  createAndSetAlbum: (name: string) => Promise<string | null>;
  setCurrentAlbum: (id: string) => void;
  setProgress: (progress: UploadProgress) => void;
  clearCurrent: () => void;
  removeUploadingAlbum: (albumId: string) => Promise<void>;
}

const AlbumContext = createContext<AlbumState>({} as AlbumState);

export function AlbumProvider({ children }: { children: React.ReactNode }) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentAlbumId, setCurrentAlbumId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({ uploaded: 0, total: 0 });

  const refreshAlbums = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await albumsApi.listAlbums();
      setAlbums(data);
    } catch {
      // Network error — leave existing data
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createAndSetAlbum = useCallback(async (name: string): Promise<string | null> => {
    try {
      const res = await albumsApi.createAlbum(name);
      setCurrentAlbumId(res.album_id);
      return res.album_id;
    } catch {
      return null;
    }
  }, []);

  const setCurrentAlbum = (id: string) => setCurrentAlbumId(id);
  const setProgress = (progress: UploadProgress) => setUploadProgress(progress);
  const clearCurrent = () => {
    setCurrentAlbumId(null);
    setUploadProgress({ uploaded: 0, total: 0 });
  };

  const removeUploadingAlbum = useCallback(async (albumId: string) => {
    try {
      await albumsApi.deleteAlbum(albumId);
      setAlbums(prev => prev.filter(a => a.album_id !== albumId));
    } catch {
      // Ignore network errors
    }
  }, []);

  return (
    <AlbumContext.Provider value={{
      albums, isLoading, currentAlbumId, uploadProgress,
      refreshAlbums, createAndSetAlbum, setCurrentAlbum, setProgress, clearCurrent, removeUploadingAlbum
    }}>
      {children}
    </AlbumContext.Provider>
  );
}

export function useAlbums() {
  return useContext(AlbumContext);
}
