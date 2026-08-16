import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Image, Alert, ActivityIndicator, Modal, Animated
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import AnimatedBackground from '../../components/AnimatedBackground';
import GlassCard from '../../components/GlassCard';
import GradientButton from '../../components/GradientButton';
import { useAlbums } from '../../context/AlbumContext';
import * as albumsApi from '../../services/albums';
import * as roomsApi from '../../services/rooms';
import { palette, getFont } from '../../theme';
import { RootStackParamList } from '../../types';

// ── Phase 4: On-Device ML Pipeline ──────────────────────────────
import { detectFaces } from '../../services/faceDetection';
import { extractEmbedding } from '../../services/faceEmbedding';
import { applyFeatureSubtraction } from '../../services/privacy';
import { encryptPhotoToFile } from '../../services/encryption';
import * as SecureStore from 'expo-secure-store';

// ── Privacy Flags ──────────────────────────────────────────────────────────
// PROTECT_EMBEDDINGS: Apply Permutation+SignFlip transform before upload.
// Fast (~0.01ms), safe to enable. Cosine distances preserved exactly.
const PROTECT_EMBEDDINGS = true;

// ENCRYPT_PHOTOS: AES-256 encrypt photo blobs before upload.
// Requires react-native-quick-crypto (native OpenSSL) for acceptable speed.
// Keep false until V2 — pure TS AES is too slow for multi-MB photos.
const ENCRYPT_PHOTOS = false;

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Upload'>;
type RouteProps = RouteProp<RootStackParamList, 'Upload'>;

type PickedPhoto = {
  uri: string;
  name: string;
  id: string;
};

export default function UploadScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const roomId = route.params?.roomId;

  const { createAndSetAlbum, setProgress, refreshAlbums } = useAlbums();

  const [albumName, setAlbumName] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const [phaseLabel, setPhaseLabel] = useState('Initializing ML models...');
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const progressAnim = React.useRef(new Animated.Value(301.6)).current;
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const progress = photos.length > 0 ? uploaded / photos.length : 0;

  React.useEffect(() => {
    if (uploading) {
      const targetOffset = 301.6 - (301.6 * progress);
      Animated.timing(progressAnim, {
        toValue: targetOffset,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [uploading, progress]);

  // ── Pick photos from gallery ─────────────────────────────────
  const pickPhotos = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
    });
    if (!result.canceled) {
      const picked: PickedPhoto[] = result.assets.map((a, i) => {
        const id = Crypto.randomUUID();
        return {
          uri: a.uri,
          name: a.fileName ?? `photo_${id}.jpg`,
          id: id,
        };
      });
      setPhotos(prev => {
        const newPhotos = picked.filter(p => !prev.some(x => x.uri === p.uri));
        return [...prev, ...newPhotos];
      });
      setUploaded(0);
    }
  };

  // ── Create album + upload all photos ─────────────────────────
  const startClustering = async () => {
    if (!roomId && !albumName.trim()) {
      Alert.alert('Name required', 'Please give your album a name.');
      return;
    }
    if (photos.length === 0) {
      Alert.alert('No photos', 'Please pick at least one photo.');
      return;
    }

    setUploading(true);

    // Yield to the JS event loop so React Native can paint the Loading Screen 
    // before we block the thread with heavy Crypto and File operations.
    await new Promise(resolve => setTimeout(resolve, 150));

    let targetId = roomId;

    if (!roomId) {
      // 1. Create album on server
      const albumId = await createAndSetAlbum(albumName.trim());
      if (!albumId) {
        Alert.alert('Error', 'Could not create album. Make sure the server is running.');
        setUploading(false);
        return;
      }
      targetId = albumId;
    }

    // ── Phase 4: Full on-device ML pipeline ─────────────────────
    let done = 0;
    setProgress({ uploaded: 0, total: photos.length });

    const allRoomFiles: Array<{ uri: string; name: string; type: string }> = [];
    const allRoomEmbeddings: number[][][] = [];
    const allRoomFaceCounts: number[] = [];
    const allRoomBboxes: number[][][] = [];

    // Fetch the shared room key for consistent permutation across all members.
    // Falls back to undefined (uses device key) for personal album uploads.
    let sharedRoomKey: string | undefined;
    if (roomId) {
      try {
        sharedRoomKey = (await SecureStore.getItemAsync(`Plexida_room_key_${roomId}`)) || roomId;
      } catch (e) {
        console.warn('[UPLOAD] Could not read room_key, falling back to roomId:', e);
        sharedRoomKey = roomId;
      }
    }

    for (const photo of photos) {
      try {
        // Step A: Optionally encrypt the photo blob before upload
        let uploadUri = photo.uri;
        if (ENCRYPT_PHOTOS) {
          setPhaseLabel(`Encrypting ${done + 1}/${photos.length}...`);
          try {
            const { encryptedUri } = await encryptPhotoToFile(photo.uri);
            uploadUri = encryptedUri;
          } catch (encErr) {
            console.warn('[UPLOAD] Encryption failed, uploading plaintext:', encErr);
          }
        } else {
          console.log(`[UPLOAD] Photo encryption disabled — uploading plaintext blob`);
        }

        // Step B: Detect faces using SCRFD on-device
        setPhaseLabel(`Detecting faces ${done + 1}/${photos.length}...`);
        let facesPayload: albumsApi.FacePayload[] = [];
        try {
          console.log(`[ML] Starting face detection for photo ${done + 1}: ${photo.name}`);
          const detected = await detectFaces(photo.uri);
          console.log(`[ML] SCRFD found ${detected.length} face(s) in ${photo.name}`);

          if (detected.length > 0) {
            // Log each detected face bbox
            detected.forEach((f, i) => {
              console.log(`[ML]   Face ${i}: bbox=[${f.bbox.map(v => Math.round(v))}] score=${f.score.toFixed(3)}`);
            });

            // Step C: Extract MobileFaceNet embedding per face (with affine alignment)
            // CRITICAL: Must run SEQUENTIALLY — TFLite model.run() shares internal
            // tensor buffers, so concurrent calls produce IDENTICAL embeddings.
            setPhaseLabel(`Embedding ${detected.length} faces ${done + 1}/${photos.length}...`);
            const faceResults: albumsApi.FacePayload[] = [];
            for (const face of detected) {
              console.log(`[ML] Extracting embedding for face ${face.faceIndex} (kps: ${face.kps.length} points)...`);
              // Pass keypoints for affine alignment — this is the key fix vs bbox-only crop
              const rawEmbedding = await extractEmbedding(
                photo.uri,
                face.kps,
                face.bbox,
                face.imgWidth,
                face.imgHeight,
              );

              // Step D: Privacy protection — Permutation + Sign Flip transform.
              // For rooms, all members use the shared room key → same vector space → HDBSCAN works.
              // For personal albums, uses device private key (no roomKey passed).
              const finalEmbedding = PROTECT_EMBEDDINGS
                ? await applyFeatureSubtraction(rawEmbedding, sharedRoomKey)
                : rawEmbedding;

              const embNorm = Math.sqrt(Array.from(finalEmbedding).reduce((s, v) => s + v*v, 0));
              console.log(`[ML]   Embedding norm: ${embNorm.toFixed(4)}`,
                `first5: [${Array.from(finalEmbedding.slice(0, 5)).map(v => v.toFixed(4))}]`);

              faceResults.push({
                face_index: face.faceIndex,
                bbox: [Math.round(face.bbox[0]), Math.round(face.bbox[1]),
                       Math.round(face.bbox[2]), Math.round(face.bbox[3])] as [number, number, number, number],
                det_score: face.score,
                embedding: Array.from(finalEmbedding),
              });
            }
            facesPayload = faceResults;
            console.log(`[ML] ✅ ${faceResults.length} face embeddings ready for photo ${photo.name}`);
          } else {
            // No faces detected — send empty payload (don't pollute DB with garbage)
            console.warn(`[ML] ⚠️ No faces detected in ${photo.name} — skipping`);
            facesPayload = [];
          }
        } catch (mlErr) {
          console.error(`[ML] ❌ ML pipeline failed for ${photo.name}:`, mlErr);
          // Don't send garbage embeddings — just skip this photo's faces
          facesPayload = [];
        }

        // Step E: Upload photo + protected embeddings to server (with retry)
        if (roomId) {
          allRoomFiles.push({ uri: uploadUri, name: photo.name, type: 'image/jpeg' });
          allRoomEmbeddings.push(facesPayload.map(f => f.embedding));
          allRoomFaceCounts.push(facesPayload.length);
          allRoomBboxes.push(facesPayload.map(f => f.bbox));
          console.log(`[ML] Batched ${photo.name} for room upload`);
        } else {
          setPhaseLabel(`Uploading ${done + 1}/${photos.length}...`);
          let uploadSuccess = false;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              await albumsApi.uploadPhoto(
                targetId!,
                uploadUri,
                photo.name,
                photo.id,
                facesPayload
              );
              uploadSuccess = true;
              console.log(`[UPLOAD] ✅ Photo ${done + 1}/${photos.length} uploaded (${facesPayload.length} faces)`);
              break;
            } catch (uploadErr: any) {
              if (attempt < 3) {
                console.warn(`[UPLOAD] ⚠️ Attempt ${attempt} failed for ${photo.name}, retrying in 1s...`, uploadErr?.message);
                await new Promise(r => setTimeout(r, 1000));
              } else {
                console.error(`[UPLOAD] ❌ All ${attempt} attempts failed for ${photo.name}:`, uploadErr);
              }
            }
          }
        }

        done++;
        setUploaded(done);
        setProgress({ uploaded: done, total: photos.length });
      } catch (e) {
        console.error('[UPLOAD] ❌ Upload failed for', photo.name, e);
      }
    }

    if (roomId) {
      setPhaseLabel('Uploading to room...');
      try {
        await roomsApi.uploadRoomPhotos(roomId, allRoomFiles, allRoomEmbeddings, allRoomFaceCounts, allRoomBboxes);
      } catch (e) {
        console.error('[UPLOAD] Room batch upload failed', e);
      }
    }

    // 3. Trigger clustering & navigate
    setPhaseLabel('Starting clustering...');
    try {
      if (roomId) {
        // Room pipeline trigger is handled automatically by backend or manually via process API if needed, 
        // but backend currently triggers RQ task on upload.
      } else {
        await albumsApi.processAlbum(targetId!);
      }
    } catch (e) {
      console.warn('Process trigger skipped (no faces):', e);
    }

    await refreshAlbums();
    setUploading(false);
    if (roomId) {
      navigation.goBack();
    } else {
      navigation.replace('Processing' as any, { albumId: targetId });
    }
  };

  const AnimatedCircle = Animated.createAnimatedComponent(Circle);

  if (uploading) {
    return (
      <AnimatedBackground orbs={[ { color: 'rgba(0,212,255,0.1)', size: 200, top: 60, left: '50%' } ]}>
        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 60, alignItems: 'center', justifyContent: 'space-between', paddingBottom: 40 }}>
          
          <View style={{ alignItems: 'center', width: '100%' }}>
            <Text style={styles.headerTitle}>On-Device AI Processing</Text>
            <Text style={{ fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400'), marginTop: 4 }}>
              {albumName || 'Room Upload'}
            </Text>
          </View>

          <View style={{ width: 110, height: 110, position: 'relative', marginVertical: 20 }}>
            <Svg width="110" height="110" viewBox="0 0 110 110">
              <Defs>
                <SvgLinearGradient id="progGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <Stop offset="0%" stopColor="#7B5CF5" />
                  <Stop offset="100%" stopColor="#00D4FF" />
                </SvgLinearGradient>
              </Defs>
              <Circle cx="55" cy="55" r="48" stroke="rgba(255,255,255,0.06)" strokeWidth="8" fill="none" />
              <AnimatedCircle
                cx="55" cy="55" r="48" stroke="url(#progGrad)" strokeWidth="8" fill="none"
                strokeDasharray="301.6" strokeDashoffset={progressAnim}
                strokeLinecap="round" origin="55, 55" rotation="-90"
              />
            </Svg>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: getFont('Syne', '800'), fontSize: 22, color: palette.silver2 }}>{Math.round(progress * 100)}%</Text>
              <Text style={{ fontSize: 9, color: palette.muted, fontFamily: getFont('DMSans', '400') }}>complete</Text>
            </View>
          </View>

          <GlassCard style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, width: '100%' }}>
            <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.cyan2, opacity: pulseAnim }} />
            <Text style={{ flex: 1, fontSize: 13, color: palette.silver2, fontFamily: getFont('Syne', '600') }}>{phaseLabel}</Text>
            <View style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, backgroundColor: 'rgba(0,212,255,0.12)', borderColor: 'rgba(0,212,255,0.25)' }}>
              <Text style={{ fontSize: 10, color: palette.cyan2, fontFamily: getFont('DMSans', '500') }}>Running</Text>
            </View>
          </GlassCard>

          <Text style={{ fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400') }}>
            Running ML models locally for privacy...
          </Text>

        </View>
      </AnimatedBackground>
    );
  }

  return (
    <AnimatedBackground>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <Path d="M10 3L5 8l5 5" stroke={palette.silver} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </Svg>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{roomId ? 'Upload to Room' : 'New album'}</Text>
        </View>

        {/* Album name input (Hidden for rooms) */}
        {!roomId && (
          <TextInput
            style={styles.nameInput}
            placeholder="Album name (e.g. Goa Trip 2025)"
            placeholderTextColor={palette.muted}
            value={albumName}
            onChangeText={setAlbumName}
            editable={!uploading}
          />
        )}

        {/* Pick photos zone */}
        <TouchableOpacity style={styles.dropZone} onPress={pickPhotos} disabled={uploading}>
          <View style={styles.dropIcon}>
            <Svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <Path d="M11 4v10M7 8l4-4 4 4" stroke={palette.violet2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <Path d="M3 16h16" stroke={palette.violet2} strokeWidth="1.8" strokeLinecap="round"/>
            </Svg>
          </View>
          <Text style={styles.dropTitle}>{photos.length > 0 ? `${photos.length} photos selected` : 'Pick from gallery'}</Text>
          <Text style={styles.dropDesc}>JPEG, PNG, HEIC · max 50MB each</Text>
        </TouchableOpacity>

        {/* Photo selection summary */}
        {photos.length > 0 && (
          <View style={styles.selectedBanner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={styles.thumbStack}>
                {photos.slice(0, 3).map((p, i) => (
                  <Image key={p.id} source={{ uri: p.uri }} style={[styles.stackedThumb, { left: i * 14, zIndex: 3 - i }]} />
                ))}
              </View>
              <Text style={styles.selectedLabel}>{photos.length} photos selected</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => setShowPreviewModal(true)}>
                <Text style={styles.viewText}>View</Text>
              </TouchableOpacity>
              {!uploading && (
                <TouchableOpacity onPress={() => setPhotos([])}>
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* CTA */}
        {!uploading && (
          <GradientButton title="Start clustering" onPress={startClustering} />
        )}

      </ScrollView>

      {/* Preview Modal */}
      <Modal visible={showPreviewModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selected Photos</Text>
              <TouchableOpacity style={styles.modalDoneBtn} onPress={() => setShowPreviewModal(false)}>
                <Text style={styles.modalDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalGrid}>
              {photos.map((p) => (
                <View key={p.id} style={styles.modalGridItem}>
                  <Image source={{ uri: p.uri }} style={styles.modalImage} />
                  {!uploading && (
                    <TouchableOpacity 
                      style={styles.modalRemoveBtn}
                      onPress={() => {
                        const newPhotos = photos.filter(x => x.id !== p.id);
                        setPhotos(newPhotos);
                        if (newPhotos.length === 0) setShowPreviewModal(false);
                      }}
                    >
                      <Svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                        <Path d="M2 2L8 8M8 2L2 8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                      </Svg>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40 },

  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  backBtn: { width: 36, height: 36, backgroundColor: palette.glass2, borderWidth: 1, borderColor: palette.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: getFont('Syne', '800'), fontSize: 16, color: palette.silver2 },

  nameInput: {
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    color: palette.silver2,
    fontFamily: getFont('DMSans', '400'),
    fontSize: 14,
    marginBottom: 14,
  },

  dropZone: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(123,92,245,0.4)', borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 16, backgroundColor: 'rgba(123,92,245,0.04)' },
  dropIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(123,92,245,0.15)', borderWidth: 1, borderColor: 'rgba(123,92,245,0.3)', marginBottom: 10, alignItems: 'center', justifyContent: 'center' },
  dropTitle: { fontFamily: getFont('Syne', '700'), fontSize: 14, color: palette.silver2, marginBottom: 4 },
  dropDesc: { fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400') },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  gridItem: { width: '31%', aspectRatio: 1, borderRadius: 12, borderWidth: 1, borderColor: palette.border },
  moreBox: { backgroundColor: 'rgba(123,92,245,0.15)', alignItems: 'center', justifyContent: 'center' },
  moreText: { color: palette.violet2, fontFamily: getFont('Syne', '700'), fontSize: 16 },

  progressWrap: { marginBottom: 14 },
  progressLabel: { fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400'), marginBottom: 6 },
  progressBarBg: { height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 2 },
  progressTextRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  progressCount: { fontSize: 10, color: palette.muted, fontFamily: getFont('DMSans', '400') },
  progressPercent: { fontSize: 10, color: palette.violet2, fontFamily: getFont('DMSans', '400') },

  loadingBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(123,92,245,0.3)', borderRadius: 16, paddingVertical: 16 },
  loadingText: { color: '#fff', fontFamily: getFont('Syne', '700'), fontSize: 15 },

  selectedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: palette.glass, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: palette.border },
  selectedLabel: { fontSize: 14, color: palette.silver2, fontFamily: getFont('Syne', '600') },
  thumbStack: { width: 50, height: 32, position: 'relative' },
  stackedThumb: { width: 32, height: 32, borderRadius: 8, position: 'absolute', borderWidth: 2, borderColor: palette.navy },
  viewText: { fontSize: 13, color: palette.violet2, fontFamily: getFont('Syne', '700') },
  clearText: { fontSize: 13, color: palette.red, fontFamily: getFont('Syne', '700') },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(5,5,15,0.9)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: palette.navy, height: '85%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1, borderColor: palette.border, borderBottomWidth: 0 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: '#fff', fontSize: 18, fontFamily: getFont('Syne', '700') },
  modalDoneBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: palette.glass2, borderRadius: 12 },
  modalDoneText: { color: palette.violet2, fontSize: 14, fontFamily: getFont('Syne', '700') },
  modalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 40 },
  modalGridItem: { width: '31%', aspectRatio: 1, position: 'relative' },
  modalImage: { width: '100%', height: '100%', borderRadius: 12 },
  modalRemoveBtn: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
