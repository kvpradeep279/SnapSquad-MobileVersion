import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Image, Alert, ActivityIndicator
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import AnimatedBackground from '../../components/AnimatedBackground';
import GradientButton from '../../components/GradientButton';
import { useAlbums } from '../../context/AlbumContext';
import * as albumsApi from '../../services/albums';
import { palette, getFont } from '../../theme';
import { RootStackParamList } from '../../types';

// ── Phase 4: On-Device ML Pipeline ──────────────────────────────
import { detectFaces } from '../../services/faceDetection';
import { extractEmbedding } from '../../services/faceEmbedding';
import { applyFeatureSubtraction } from '../../services/privacy';
import { encryptPhotoToFile } from '../../services/encryption';

// ── Privacy Flags ──────────────────────────────────────────────────────────
// PROTECT_EMBEDDINGS: Apply Permutation+SignFlip transform before upload.
// Fast (~0.01ms), safe to enable. Cosine distances preserved exactly.
const PROTECT_EMBEDDINGS = true;

// ENCRYPT_PHOTOS: AES-256 encrypt photo blobs before upload.
// Requires react-native-quick-crypto (native OpenSSL) for acceptable speed.
// Keep false until V2 — pure TS AES is too slow for multi-MB photos.
const ENCRYPT_PHOTOS = false;

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Upload'>;

type PickedPhoto = {
  uri: string;
  name: string;
  id: string;
};

export default function UploadScreen() {
  const navigation = useNavigation<NavProp>();
  const { createAndSetAlbum, setProgress, refreshAlbums } = useAlbums();

  const [albumName, setAlbumName] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const [phaseLabel, setPhaseLabel] = useState('Uploading...');

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
      quality: 0.8,
    });
    if (!result.canceled) {
      const picked: PickedPhoto[] = result.assets.map((a, i) => ({
        uri: a.uri,
        name: a.fileName ?? `photo_${Date.now()}_${i}.jpg`,
        id: `${Date.now()}_${i}`,
      }));
      setPhotos(picked);
      setUploaded(0);
    }
  };

  // ── Create album + upload all photos ─────────────────────────
  const startClustering = async () => {
    if (!albumName.trim()) {
      Alert.alert('Name required', 'Please give your album a name.');
      return;
    }
    if (photos.length === 0) {
      Alert.alert('No photos', 'Please pick at least one photo.');
      return;
    }

    setUploading(true);

    // 1. Create album on server
    const albumId = await createAndSetAlbum(albumName.trim());
    if (!albumId) {
      Alert.alert('Error', 'Could not create album. Make sure the server is running.');
      setUploading(false);
      return;
    }

    // ── Phase 4: Full on-device ML pipeline ─────────────────────
    let done = 0;
    setProgress({ uploaded: 0, total: photos.length });

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

              // Step D: Privacy protection — Permutation + Sign Flip transform
              // Fast (~0.01ms), exactly preserves cosine distances for HDBSCAN
              const finalEmbedding = PROTECT_EMBEDDINGS
                ? await applyFeatureSubtraction(rawEmbedding)
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
        setPhaseLabel(`Uploading ${done + 1}/${photos.length}...`);
        let uploadSuccess = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await albumsApi.uploadPhoto(
              albumId,
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

        done++;
        setUploaded(done);
        setProgress({ uploaded: done, total: photos.length });
      } catch (e) {
        console.error('[UPLOAD] ❌ Upload failed for', photo.name, e);
      }
    }

    // 3. Trigger clustering & navigate
    setPhaseLabel('Starting clustering...');
    try {
      await albumsApi.processAlbum(albumId);
    } catch (e) {
      console.warn('Process trigger skipped (no faces):', e);
    }

    await refreshAlbums();
    setUploading(false);
    navigation.navigate('Processing' as any, { albumId });
  };

  const progress = photos.length > 0 ? uploaded / photos.length : 0;

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
          <Text style={styles.headerTitle}>New album</Text>
        </View>

        {/* Album name input */}
        <TextInput
          style={styles.nameInput}
          placeholder="Album name (e.g. Goa Trip 2025)"
          placeholderTextColor={palette.muted}
          value={albumName}
          onChangeText={setAlbumName}
          editable={!uploading}
        />

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

        {/* Photo grid preview */}
        {photos.length > 0 && (
          <>
            <Text style={styles.selectedLabel}>Selected ({photos.length} photos)</Text>
            <View style={styles.grid}>
              {photos.slice(0, 5).map((p, i) => (
                <Image key={p.id} source={{ uri: p.uri }} style={styles.gridItem} />
              ))}
              {photos.length > 5 && (
                <View style={[styles.gridItem, styles.moreBox]}>
                  <Text style={styles.moreText}>+{photos.length - 5}</Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* Upload progress (while uploading) */}
        {uploading && (
          <View style={styles.progressWrap}>
            <Text style={styles.progressLabel}>Upload progress</Text>
            <View style={styles.progressBarBg}>
              <LinearGradient
                colors={palette.gradient.hero}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[styles.progressBarFill, { width: `${Math.round(progress * 100)}%` }]}
              />
            </View>
            <View style={styles.progressTextRow}>
              <Text style={styles.progressCount}>{uploaded} of {photos.length} uploaded</Text>
              <Text style={styles.progressPercent}>{Math.round(progress * 100)}%</Text>
            </View>
          </View>
        )}

        {/* CTA */}
        {uploading ? (
          <View style={styles.loadingBtn}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.loadingText}>Uploading...</Text>
          </View>
        ) : (
          <GradientButton title="Start clustering" onPress={startClustering} />
        )}

      </ScrollView>
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

  selectedLabel: { fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400'), marginBottom: 8 },
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
});
