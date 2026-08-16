import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { getFirebaseIdToken } from '../services/auth';
import { Alert } from 'react-native';
import api, { BASE_URL } from '../services/api';

export const downloadPhotos = async (
  albumId: string, 
  photoIds: string[], 
  onProgress?: (done: number, total: number) => void
) => {
  if (photoIds.length === 0) return;

  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission needed', 'Please allow media library access to save photos.');
    return;
  }

  const token = await getFirebaseIdToken();
  let successCount = 0;
  let failCount = 0;
  let done = 0;
  
  const createdAssets = [];

  for (const photoId of photoIds) {
    try {
      const url = `${BASE_URL}/albums/${albumId}/photos/${photoId}/raw`;
      const tempPath = `${FileSystem.cacheDirectory}export_${photoId}.jpg`;

      const result = await FileSystem.downloadAsync(url, tempPath, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (result.status === 200) {
        const asset = await MediaLibrary.createAssetAsync(result.uri);
        createdAssets.push(asset);
        successCount++;
      } else {
        failCount++;
      }
    } catch (e) {
      failCount++;
      console.error(`Failed to download photo ${photoId}`, e);
    } finally {
      done++;
      if (onProgress) onProgress(done, photoIds.length);
    }
  }

  // Batch add to album to prevent multiple OS modals
  if (createdAssets.length > 0) {
    try {
      const album = await MediaLibrary.getAlbumAsync('Plexida');
      if (album === null) {
        const newAlbum = await MediaLibrary.createAlbumAsync('Plexida', createdAssets[0], false);
        if (createdAssets.length > 1) {
          await MediaLibrary.addAssetsToAlbumAsync(createdAssets.slice(1), newAlbum, false);
        }
      } else {
        await MediaLibrary.addAssetsToAlbumAsync(createdAssets, album, false);
      }
    } catch (e) {
      console.error('Failed to add assets to album', e);
    }
  }

  if (failCount === 0) {
    Alert.alert('Export complete ✅', `${successCount} photos saved to your gallery.`);
  } else {
    Alert.alert('Export done with issues', `${successCount} saved, ${failCount} failed.`);
  }
};
