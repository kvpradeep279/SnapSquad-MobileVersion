import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { palette } from '../../theme';
import { RootStackParamList } from '../../types';
import { findMeInRoom } from '../../services/rooms';
import AuthImage from '../../components/AuthImage';

import { Feather } from '@expo/vector-icons';
import { detectFaces } from '../../services/faceDetection';
import { extractEmbedding } from '../../services/faceEmbedding';
import { applyFeatureSubtraction } from '../../services/privacy';
import * as SecureStore from 'expo-secure-store';
import { getFirebaseIdToken } from '../../services/auth';
import { downloadPhotos } from '../../utils/export';

type NavProps = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'FindMe'>;

export default function FindMeScreen() {
  const navigation = useNavigation<NavProps>();
  const route = useRoute<RouteProps>();
  const { roomId } = route.params;

  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<'camera' | 'searching' | 'results' | 'error'>('camera');
  const [matches, setMatches] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  // Camera lifecycle guards
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // Download state
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ done: 0, total: 0 });

  const cameraRef = useRef<any>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [state]);

  async function takeSelfie() {
    if (isCapturing) return;
    setIsCapturing(true);

    try {
      let photoUri: string | null = null;

      // Try camera first — only if the camera has signalled it's ready
      if (cameraRef.current && isCameraReady) {
        try {
          console.log('[FindMe] Capturing selfie via CameraView...');
          const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
          if (photo?.uri) photoUri = photo.uri;
        } catch (camErr) {
          console.warn('[FindMe] Camera capture failed, falling back to image picker:', camErr);
        }
      }

      // Fallback to gallery if camera failed or not ready
      if (!photoUri) {
        console.log('[FindMe] Using image picker fallback...');
        const pickerResult = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
        });
        if (!pickerResult.canceled && pickerResult.assets[0]) {
          photoUri = pickerResult.assets[0].uri;
        } else {
          setIsCapturing(false);
          return; // user cancelled
        }
      }

      // We have a photo — now transition to searching.
      // CameraView stays mounted (state is still 'camera' until we set it below).
      setState('searching');

      console.log('[FindMe] Processing selfie:', photoUri);
      const detected = await detectFaces(photoUri);

      if (detected.length === 0) {
        setErrorMsg('No face detected in your selfie. Please ensure your face is well-lit and centered, then try again.');
        setState('error');
        return;
      }

      const face = detected[0];
      const rawEmbedding = await extractEmbedding(
        photoUri,
        face.kps,
        face.bbox,
        face.imgWidth,
        face.imgHeight
      );

      // Fetch shared room key — MUST match the key used during upload.
      let roomKey: string | undefined;
      try {
        roomKey = (await SecureStore.getItemAsync(`Plexida_room_key_${roomId}`)) || roomId;
      } catch {
        roomKey = roomId;
      }

      const protectedEmbedding = await applyFeatureSubtraction(rawEmbedding, roomKey);
      const embedding = Array.from(protectedEmbedding);

      console.log('[FindMe] Searching room with embedding dim:', embedding.length);
      const results = await findMeInRoom(roomId, embedding);
      setMatches(results);
      setState('results');
    } catch (err: any) {
      console.error('[FindMe] Search failed:', err);
      const detail = err?.response?.data?.detail || err?.message || 'Unknown error';
      if (detail.toLowerCase().includes('pgvector') || detail.toLowerCase().includes('operator')) {
        setErrorMsg('Vector search is not set up on this server. Contact the room creator.');
      } else if (detail.toLowerCase().includes('no face')) {
        setErrorMsg('No face detected. Please try again with better lighting.');
      } else {
        setErrorMsg(`Search failed: ${detail}`);
      }
      setState('error');
    } finally {
      setIsCapturing(false);
    }
  }

  const handleDownload = async () => {
    if (matches.length === 0) return;
    setDownloading(true);
    setDownloadProgress({ done: 0, total: matches.length });
    
    // Fetch shadow_album_id. The endpoint requires albumId.
    // Wait, the utility uses /albums/{albumId}/photos/{photoId}/raw.
    // We only have roomId here. We can use the room photo raw endpoint.
    // I need to update downloadPhotos to support room photos, or write it here.
    // Let's write the room download logic here since it uses room endpoint.
    const MediaLibrary = require('expo-media-library');
    const FileSystem = require('expo-file-system/legacy');
    
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      alert('Permission needed to save photos.');
      setDownloading(false);
      return;
    }

    const token = await getFirebaseIdToken();
    let successCount = 0;
    let failCount = 0;
    let done = 0;
    const createdAssets = [];

    for (const match of matches) {
      try {
        const url = `${require('../../services/api').default.defaults.baseURL}/rooms/${roomId}/photos/${match.photo_id}/raw`;
        const tempPath = `${FileSystem.cacheDirectory}export_${match.photo_id}.jpg`;

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
      } finally {
        done++;
        setDownloadProgress({ done, total: matches.length });
      }
    }

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
        console.error('Failed to add to album', e);
      }
    }

    setDownloading(false);
    if (failCount === 0) {
      alert(`Export complete: ${successCount} photos saved.`);
    } else {
      alert(`Export done: ${successCount} saved, ${failCount} failed.`);
    }
  };

  // ── Permission checks ───────────────────────────────────────────
  if (!permission) {
    return <View style={styles.center}><ActivityIndicator color={palette.violet2} /></View>;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={{ fontSize: 40, marginBottom: 16 }}>📷</Text>
          <Text style={styles.title}>Camera Access Needed</Text>
          <Text style={styles.subtitle}>
            Take a selfie so we can find your photos in this event.
          </Text>
          <TouchableOpacity onPress={requestPermission} style={styles.btn}>
            <LinearGradient colors={palette.gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btnGrad}>
              <Text style={styles.btnText}>Allow Camera</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render ──────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Find Me</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Camera state — keep mounted during capture so takePictureAsync can complete */}
        {(state === 'camera' || isCapturing) && (
          <View style={styles.cameraContainer}>
            <View style={styles.cameraWrapper}>
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing="front"
                mode="picture"
                onCameraReady={() => setIsCameraReady(true)}
              />
              {/* Frame overlay */}
              <View style={styles.faceGuide} />

              {/* Capturing overlay — shown on top of live camera */}
              {isCapturing && (
                <View style={styles.capturingOverlay}>
                  <ActivityIndicator size="large" color={palette.cyan} />
                </View>
              )}
            </View>

            <Text style={styles.hint}>Center your face to find your photos</Text>

            <TouchableOpacity
              onPress={takeSelfie}
              style={[styles.captureBtn, (isCapturing || !isCameraReady) && styles.captureBtnDisabled]}
              disabled={isCapturing || !isCameraReady}
            >
              {isCapturing ? (
                <ActivityIndicator color={palette.white} />
              ) : (
                <LinearGradient colors={palette.gradient.hero} style={styles.captureInner} />
              )}
            </TouchableOpacity>

            {!isCameraReady && !isCapturing && (
              <Text style={styles.hintSmall}>Initialising camera…</Text>
            )}
          </View>
        )}

        {state === 'searching' && !isCapturing && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={palette.cyan} style={{ marginBottom: 20 }} />
            <Text style={styles.title}>Searching Event...</Text>
            <Text style={styles.subtitle}>Scanning thousands of photos privately</Text>
          </View>
        )}

        {state === 'error' && (
          <View style={styles.center}>
            <Text style={{ fontSize: 40, marginBottom: 16 }}>❌</Text>
            <Text style={styles.title}>Search Failed</Text>
            <Text style={styles.subtitle}>{errorMsg}</Text>
            <TouchableOpacity onPress={() => { setIsCameraReady(false); setState('camera'); }} style={styles.btn}>
              <LinearGradient colors={palette.gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btnGrad}>
                <Text style={styles.btnText}>Try Again</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {state === 'results' && (
          <View style={styles.resultsContainer}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 }}>
              <Text style={styles.resultsHeader}>
                Found {matches.length} {matches.length === 1 ? 'photo' : 'photos'} of you
              </Text>
              {matches.length > 0 && (
                <TouchableOpacity onPress={handleDownload} disabled={downloading}>
                  <Text style={{ color: palette.cyan, fontWeight: '700' }}>
                    {downloading ? `Saving ${downloadProgress.done}/${downloadProgress.total}` : 'Download All'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {matches.length === 0 ? (
              <View style={styles.center}>
                <Feather name="search" size={48} color={palette.silver} style={{ marginBottom: 16 }} />
                <Text style={styles.subtitle}>We couldn't find you in this event yet.</Text>
                <TouchableOpacity onPress={() => { setIsCameraReady(false); setState('camera'); }} style={[styles.btn, { marginTop: 32 }]}>
                  <LinearGradient colors={palette.gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btnGrad}>
                    <Text style={styles.btnText}>Retake Selfie</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={matches}
                keyExtractor={(item) => item.photo_id}
                numColumns={3}
                contentContainerStyle={{ padding: 2 }}
                renderItem={({ item }) => (
                  <View style={styles.gridItem}>
                    <AuthImage
                      url={`${require('../../services/api').default.defaults.baseURL}/rooms/${roomId}/photos/${item.photo_id}/raw`}
                      style={styles.gridImage}
                    />
                    <View style={styles.matchBadge}>
                      <Text style={styles.matchText}>{Math.round(item.similarity * 100)}% Match</Text>
                    </View>
                  </View>
                )}
              />
            )}
          </View>
        )}

      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  backBtnText: { color: palette.silver, fontSize: 24, fontWeight: '600' },
  headerTitle: { color: palette.white, fontSize: 18, fontWeight: '700' },

  title: { fontSize: 22, fontWeight: '700', color: palette.white, marginBottom: 12, textAlign: 'center' },
  subtitle: { fontSize: 14, color: palette.muted, textAlign: 'center', lineHeight: 22, marginBottom: 32 },

  btn: { width: '100%', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: palette.border },
  btnGrad: { paddingVertical: 16, alignItems: 'center' },
  btnText: { color: palette.white, fontWeight: '700', fontSize: 16 },

  cameraContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
  cameraWrapper: {
    width: 280,
    height: 380,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: palette.border,
  },
  faceGuide: {
    position: 'absolute',
    top: '15%',
    left: '15%',
    width: '70%',
    height: '60%',
    borderRadius: 100,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    borderStyle: 'dashed',
  },
  capturingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hint: { color: palette.silver, fontSize: 15, marginBottom: 40 },
  hintSmall: { color: palette.muted, fontSize: 12, marginTop: 8 },
  captureBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: palette.glass,
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureBtnDisabled: { opacity: 0.45 },
  captureInner: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
  },

  resultsContainer: { flex: 1 },
  resultsHeader: { color: palette.white, fontSize: 16, fontWeight: '600', padding: 20 },
  gridItem: { flex: 1/3, aspectRatio: 1, padding: 2, position: 'relative' },
  gridImage: { flex: 1, borderRadius: 8, backgroundColor: palette.card },
  matchBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  matchText: { color: palette.green, fontSize: 10, fontWeight: '700' },
});
