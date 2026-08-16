import React, { useEffect, useState } from 'react';
import { View, Text, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { manipulateAsync } from 'expo-image-manipulator';
import { getFirebaseIdToken } from '../services/auth';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { BASE_URL } from '../services/api';
import { palette } from '../theme';

interface FaceAvatarProps {
  albumId: string;
  photoId: string;
  bbox: [number, number, number, number];
  size?: number;
  borderRadius?: number;
}

const FALLBACK_GRADS: [string, string][] = [
  ['rgba(123,92,245,0.5)', 'rgba(0,212,255,0.4)'],
  ['rgba(0,212,255,0.4)', 'rgba(77,235,160,0.3)'],
  ['rgba(255,208,96,0.3)', 'rgba(123,92,245,0.4)'],
];

export default function FaceAvatar({ albumId, photoId, bbox, size = 60, borderRadius }: FaceAvatarProps) {
  const finalBorderRadius = borderRadius !== undefined ? borderRadius : size / 2;
  const [croppedUri, setCroppedUri] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const cropFace = async () => {
      try {
        setLoading(true);
        setError(false);
        const token = await getFirebaseIdToken();

        const fileUrl = `${BASE_URL}/albums/${albumId}/photos/${photoId}/raw`;
        
        // Cache bust uniquely per session so development tweaks actually apply instantly
        const uniqueId = Math.random().toString(36).substring(7);
        const downloadPath = `${FileSystem.cacheDirectory}raw_${photoId}_${uniqueId}.jpg`;

        const downloadPromise = FileSystem.downloadAsync(fileUrl, downloadPath, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Network request timed out')), 10000);
        });

        const downloadResult = await Promise.race([downloadPromise, timeoutPromise]) as FileSystem.FileSystemDownloadResult;

        if (downloadResult.status !== 200) {
          throw new Error(`Download failed with status ${downloadResult.status}`);
        }

        const processableUri = downloadResult.uri;

        // Clamp bbox to valid positive values before cropping
        const [x1Raw, y1Raw, x2Raw, y2Raw] = bbox;
        const isBboxZero = x1Raw === 0 && y1Raw === 0 && x2Raw === 0 && y2Raw === 0;

        if (isBboxZero) {
          if (isMounted) setCroppedUri(processableUri);
          return;
        }

        const originX = Math.max(0, Math.floor(x1Raw));
        const originY = Math.max(0, Math.floor(y1Raw));
        const width = Math.max(4, Math.floor(x2Raw - x1Raw));
        const height = Math.max(4, Math.floor(y2Raw - y1Raw));

        // Add a slight padding around the face for nicer cropping (10% on each side -> 1.2x zoom essentially)
        // The user requested it to be zoomed out more. We'll use 40% padding on each side.
        // This gives a nice breathing room so the face doesn't look claustrophobic.
        const paddingX = Math.floor(width * 0.4);
        const paddingY = Math.floor(height * 0.4);
        const safeOriginX = Math.max(0, originX - paddingX);
        const safeOriginY = Math.max(0, originY - paddingY);
        const safeWidth = width + paddingX * 2;
        const safeHeight = height + paddingY * 2;

        let cropResult;
        try {
          cropResult = await manipulateAsync(
            processableUri,
            [{ crop: { originX: safeOriginX, originY: safeOriginY, width: safeWidth, height: safeHeight } }],
            { compress: 0.85, format: 'jpeg' as any }
          );
        } catch (boundsError) {
          // If the 40% padding expands past the physical edge of the photo, Android will throw an exception.
          // In that case, we instantly fall back to the tight 10% padding which is much safer.
          const tightPaddingX = Math.floor(width * 0.1);
          const tightPaddingY = Math.floor(height * 0.1);
          const tightOriginX = Math.max(0, originX - tightPaddingX);
          const tightOriginY = Math.max(0, originY - tightPaddingY);
          const tightWidth = width + tightPaddingX * 2;
          const tightHeight = height + tightPaddingY * 2;

          cropResult = await manipulateAsync(
            processableUri,
            [{ crop: { originX: tightOriginX, originY: tightOriginY, width: tightWidth, height: tightHeight } }],
            { compress: 0.85, format: 'jpeg' as any }
          );
        }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumId, photoId, bbox.join(',')]);

  if (loading) {
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius: finalBorderRadius }]}>
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
        style={{ width: size, height: size, borderRadius: finalBorderRadius }}
      >
        <Text style={{ fontSize: size * 0.4 }}>👤</Text>
      </LinearGradient>
    );
  }

  return (
    <Image
      source={{ uri: croppedUri }}
      style={{ width: size, height: size, borderRadius: finalBorderRadius, backgroundColor: palette.card }}
      resizeMode="cover"
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
