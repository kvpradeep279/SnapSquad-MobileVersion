import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import AnimatedBackground from '../../components/AnimatedBackground';
import GlassCard from '../../components/GlassCard';
import { useAuth } from '../../context/AuthContext';
import { updateProfile } from '../../services/auth';
import { palette, getFont } from '../../theme';

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const { user, updateUser } = useAuth();

  const [username, setUsername] = useState(user?.username || '');
  const [saving, setSaving] = useState(false);

  const avatarLetter = (user?.username?.[0] || user?.email?.[0] || '?').toUpperCase();

  const handleSave = async () => {
    const payload: { username?: string; password?: string } = {};

    // Username change
    if (username.trim() && username.trim() !== user?.username) {
      payload.username = username.trim();
    }



    if (Object.keys(payload).length === 0) {
      Alert.alert('No changes', 'Nothing was changed.');
      return;
    }

    setSaving(true);
    const result = await updateProfile(payload);
    setSaving(false);

    if (result.success && result.user) {
      updateUser(result.user);
      Alert.alert('Saved', 'Profile updated successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } else {
      Alert.alert('Error', result.error || 'Failed to update profile.');
    }
  };

  return (
    <AnimatedBackground>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Top bar */}
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <Path d="M10 3L5 8l5 5" stroke={palette.silver} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </Svg>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Edit Profile</Text>
          </View>

          {/* Avatar section */}
          <View style={styles.avatarSection}>
            <LinearGradient
              colors={palette.gradient.hero}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.avatar}
            >
              <Text style={styles.avatarText}>{avatarLetter}</Text>
            </LinearGradient>
            <Text style={styles.emailBadge}>{user?.email}</Text>
          </View>

          {/* Username */}
          <Text style={styles.sectionLabel}>Username</Text>
          <GlassCard style={styles.inputCard}>
            <Svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ marginRight: 10 }}>
              <Circle cx="7.5" cy="5" r="3" stroke={palette.muted} strokeWidth="1.3"/>
              <Path d="M2 13c0-2.76 2.46-5 5.5-5s5.5 2.24 5.5 5" stroke={palette.muted} strokeWidth="1.3" strokeLinecap="round"/>
            </Svg>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="Username"
              placeholderTextColor={palette.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </GlassCard>



          {/* Save button */}
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
            <LinearGradient
              colors={palette.gradient.hero}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.saveBtnGrad}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Save Changes</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40 },

  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  backBtn: { width: 36, height: 36, backgroundColor: palette.glass2, borderWidth: 1, borderColor: palette.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: getFont('Syne', '800'), fontSize: 16, color: palette.silver2 },

  avatarSection: { alignItems: 'center', marginBottom: 28 },
  avatar: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatarText: { fontFamily: getFont('Syne', '800'), fontSize: 26, color: '#fff' },
  emailBadge: { fontSize: 12, color: palette.muted, fontFamily: getFont('DMSans', '400') },

  sectionLabel: { fontSize: 10, color: palette.muted, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 },

  inputCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },
  input: { flex: 1, color: palette.silver2, fontFamily: getFont('DMSans', '400'), fontSize: 14 },
  eyeBtn: { fontSize: 12, paddingLeft: 8, color: palette.muted, fontFamily: getFont('DMSans', '500') },

  saveBtn: { marginTop: 28, borderRadius: 16, overflow: 'hidden' },
  saveBtnGrad: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontFamily: getFont('Syne', '700'), fontSize: 15, letterSpacing: 0.3 },
});
