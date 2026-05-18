import React, { useEffect, useState } from 'react';
import { Image, ImageStyle, StyleProp, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';

interface AuthImageProps {
  url: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
}

export default function AuthImage({ url, style, resizeMode = 'cover' }: AuthImageProps) {
  const [localUri, setLocalUri] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const downloadImage = async () => {
      try {
        const token = await SecureStore.getItemAsync('auth_token');
        if (!token) return;

        // Extract photoId from URL: e.g. /albums/xxx/photos/yyy/raw → yyy
        const segments = url.split('/');
        const rawIndex = segments.indexOf('raw');
        const filename = rawIndex > 0 ? segments[rawIndex - 1] : url.replace(/[^a-z0-9]/gi, '_');
        const cachedPath = `${FileSystem.cacheDirectory}auth_img_${filename}.jpg`;

        // Return cached file if it exists
        const info = await FileSystem.getInfoAsync(cachedPath);
        if (info.exists) {
          if (isMounted) setLocalUri(cachedPath);
          return;
        }

        // Download with auth header
        const result = await FileSystem.downloadAsync(url, cachedPath, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (result.status === 200 && isMounted) {
          setLocalUri(result.uri);
        }
      } catch (err) {
        console.warn('[AuthImage] Download failed:', err);
      }
    };

    downloadImage();

    return () => { isMounted = false; };
  }, [url]);

  if (!localUri) {
    return <View style={[style, { backgroundColor: 'rgba(255,255,255,0.05)' }]} />;
  }

  return <Image source={{ uri: localUri }} style={style} resizeMode={resizeMode} />;
}
