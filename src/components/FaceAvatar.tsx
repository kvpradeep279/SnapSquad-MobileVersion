import React, { useEffect, useState } from 'react';
import { View, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { manipulateAsync } from 'expo-image-manipulator';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { BASE_URL } from '../services/api';
import { palette } from '../theme';

interface FaceAvatarProps {
  albumId: string;
  photoId: string;
  bbox: [number, number, number, number];
  size?: number;
}

const FALLBACK_GRADS: [string, string][] = [
  ['rgba(123,92,245,0.5)', 'rgba(0,212,255,0.4)'],
  ['rgba(0,212,255,0.4)', 'rgba(77,235,160,0.3)'],
  ['rgba(255,208,96,0.3)', 'rgba(123,92,245,0.4)'],
];

export default function FaceAvatar({ albumId, photoId, bbox, size = 60 }: FaceAvatarProps) {
  const [croppedUri, setCroppedUri] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const cropFace = async () => {
      try {
        setLoading(true);
        setError(false);
        const token = await SecureStore.getItemAsync('auth_token');

        const fileUrl = `${BASE_URL}/albums/${albumId}/photos/${photoId}/raw`;
        const downloadPath = `${FileSystem.cacheDirectory}raw_${photoId}.jpg`;

        const downloadResult = await FileSystem.downloadAsync(fileUrl, downloadPath, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (downloadResult.status !== 200) {
          throw new Error(`Download failed with status ${downloadResult.status}`);
        }

        const processableUri = downloadResult.uri;

        // Clamp bbox to valid positive values before cropping
        const [x1Raw, y1Raw, x2Raw, y2Raw] = bbox;
        const originX = Math.max(0, Math.floor(x1Raw));
        const originY = Math.max(0, Math.floor(y1Raw));
        const width = Math.max(4, Math.floor(x2Raw - x1Raw));
        const height = Math.max(4, Math.floor(y2Raw - y1Raw));

        // Add a slight padding around the face for nicer cropping
        const paddingX = Math.floor(width * 0.1);
        const paddingY = Math.floor(height * 0.1);
        const safeOriginX = Math.max(0, originX - paddingX);
        const safeOriginY = Math.max(0, originY - paddingY);
        const safeWidth = width + paddingX * 2;
        const safeHeight = height + paddingY * 2;

        const cropResult = await manipulateAsync(
          processableUri,
          [{ crop: { originX: safeOriginX, originY: safeOriginY, width: safeWidth, height: safeHeight } }],
          { compress: 0.85, format: 'jpeg' as any }
        );

        if (isMounted) setCroppedUri(cropResult.uri);
      } catch (err) {
        console.warn('FaceAvatar crop failed:', err);
        if (isMounted) setError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    cropFace();
    return () => { isMounted = false; };
  }, [albumId, photoId, bbox]);

  if (loading) {
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
        <ActivityIndicator size="small" color={palette.violet2} />
      </View>
    );
  }

  // On error: show a gradient fallback instead of returning null
  if (error || !croppedUri) {
    const gradIdx = (photoId.charCodeAt(0) || 0) % FALLBACK_GRADS.length;
    return (
      <LinearGradient
        colors={FALLBACK_GRADS[gradIdx]}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }

  return (
    <Image
      source={{ uri: croppedUri }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
