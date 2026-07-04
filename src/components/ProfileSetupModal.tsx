import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { palette, getFont } from '../theme';
import * as ImagePicker from 'expo-image-picker';
import { setProfileEmbedding } from '../services/profile';
import { detectFaces } from '../services/faceDetection';
import { extractEmbedding } from '../services/faceEmbedding';
import { applyFeatureSubtraction } from '../services/privacy';

interface Props {
  visible: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export default function ProfileSetupModal({ visible, onComplete, onSkip }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePickImage = async (useCamera: boolean) => {
    try {
      const { status } = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        setError('Permission denied');
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 1,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 1,
          });

      if (result.canceled || !result.assets[0]) return;

      setLoading(true);
      setError(null);

      // Process image to extract face embedding natively
      const detected = await detectFaces(result.assets[0].uri);

      if (detected.length === 0) {
        setError('No face detected. Please try again with a clearer photo.');
        setLoading(false);
        return;
      }

      if (detected.length > 1) {
        setError('Multiple faces detected. Please use a photo with only you.');
        setLoading(false);
        return;
      }

      const face = detected[0];
      const rawEmbedding = await extractEmbedding(
        result.assets[0].uri,
        face.kps,
        face.bbox,
        face.imgWidth,
        face.imgHeight,
      );

      const finalEmbedding = await applyFeatureSubtraction(rawEmbedding);

      // Upload embedding
      await setProfileEmbedding(Array.from(finalEmbedding));
      
      setLoading(false);
      onComplete();

    } catch (err) {
      console.error(err);
      setError('Failed to process image');
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Set up Auto-ID</Text>
          <Text style={styles.subtitle}>
            Upload a clear photo of yourself. The AI will learn your face and automatically tag you as "Me" in all future uploads.
          </Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.buttonRow}>
            <TouchableOpacity 
              style={[styles.primaryBtn, { flex: 1, marginRight: 8 }]} 
              onPress={() => handlePickImage(true)}
              disabled={loading}
            >
              <Text style={styles.primaryBtnText}>Take Selfie</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.secondaryBtn, { flex: 1, marginLeft: 8 }]} 
              onPress={() => handlePickImage(false)}
              disabled={loading}
            >
              <Text style={styles.secondaryBtnText}>Choose Photo</Text>
            </TouchableOpacity>
          </View>

          {loading && <ActivityIndicator style={{ marginTop: 20 }} color={palette.primary} />}

          <TouchableOpacity style={styles.skipBtn} onPress={onSkip} disabled={loading}>
            <Text style={styles.skipBtnText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    backgroundColor: '#000000',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  title: {
    ...getFont('700', 22),
    color: palette.white,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    ...getFont('400', 14),
    color: palette.silver,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: '#22222A',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    ...getFont('600', 15),
    color: palette.white,
  },
  secondaryBtn: {
    backgroundColor: '#22222A',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    ...getFont('600', 15),
    color: palette.white,
  },
  skipBtn: {
    backgroundColor: '#16161C',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  skipBtnText: {
    ...getFont('600', 15),
    color: palette.white,
  },
  errorText: {
    ...getFont('500', 13),
    color: palette.tomato,
    textAlign: 'center',
    marginBottom: 16,
  },
});
