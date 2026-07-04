import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Image, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AnimatedBackground from '../../components/AnimatedBackground';
import GlassCard from '../../components/GlassCard';
import MockupBottomTabs from '../../components/MockupBottomTabs';
import SkeletonLoader from '../../components/SkeletonLoader';
import EmptyState from '../../components/EmptyState';
import ConfirmModal from '../../components/ConfirmModal';
import AuthImage from '../../components/AuthImage';
import { useAlbums } from '../../context/AlbumContext';
import { deleteAlbum } from '../../services/albums';
import { useAuth } from '../../context/AuthContext';
import { palette, getFont } from '../../theme';
import { RootStackParamList } from '../../types';
import api from '../../services/api';
import { registerForPushNotificationsAsync } from '../../services/notifications';
import ProfileSetupModal from '../../components/ProfileSetupModal';
import { getProfileStatus } from '../../services/profile';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

// Map album status → pill config
const STATUS_PILL: Record<string, { label: string; color: string; bg: string; border: string }> = {
  complete:   { label: 'Done',       color: '#4DEBA0', bg: 'rgba(0,220,130,0.12)',  border: 'rgba(0,220,130,0.25)' },
  clustering: { label: 'Processing', color: '#FFD060', bg: 'rgba(255,180,0,0.12)',  border: 'rgba(255,180,0,0.25)' },
  uploading:  { label: 'Uploading',  color: '#FFD060', bg: 'rgba(255,180,0,0.12)',  border: 'rgba(255,180,0,0.25)' },
  created:    { label: 'Queued',     color: palette.violet2, bg: 'rgba(123,92,245,0.18)', border: 'rgba(123,92,245,0.3)' },
  failed:     { label: 'Failed',     color: '#FF7070', bg: 'rgba(255,80,80,0.12)',  border: 'rgba(255,80,80,0.25)' },
};

const GRAD_COLORS = [
  ['rgba(123,92,245,0.3)', 'rgba(0,212,255,0.2)'],
  ['rgba(0,212,255,0.2)',  'rgba(77,235,160,0.15)'],
  ['rgba(77,235,160,0.15)','rgba(123,92,245,0.2)'],
  ['rgba(255,208,96,0.15)','rgba(0,212,255,0.1)'],
  ['rgba(123,92,245,0.2)', 'rgba(255,80,80,0.1)'],
];

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { albums, isLoading, refreshAlbums, removeUploadingAlbum } = useAlbums();
  const { user } = useAuth();
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    isDestructive?: boolean;
    onConfirm: () => void;
    cancelText?: string;
    confirmText?: string;
    hideCancel?: boolean;
  }>({
    visible: false, title: '', message: '', onConfirm: () => {}
  });

  const [showProfileModal, setShowProfileModal] = useState(false);

  const closeConfirm = () => setConfirmModal(prev => ({ ...prev, visible: false }));

  const avatarLetter = (user?.username?.[0] || user?.email?.[0] || 'S').toUpperCase();
  const displayName = user?.username || user?.email?.split('@')[0] || 'there';

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  useEffect(() => {
    SecureStore.getItemAsync('auth_token').then(setAuthToken);
    refreshAlbums();
    registerForPushNotificationsAsync();
    
    // Check if user has set up their profile
    const checkProfile = async () => {
      try {
        if (!user?.id) return;
        const skipped = await SecureStore.getItemAsync(`profile_skipped_${user.id}`);
        if (skipped === 'true') return;
        
        const res = await getProfileStatus();
        if (!res.has_profile) {
          setShowProfileModal(true);
        }
      } catch (e) {
        console.error('Failed to check profile status', e);
      }
    };
    if (user?.id) {
      checkProfile();
    }
  }, [user?.id]);

  const handleProfileComplete = async () => {
    setShowProfileModal(false);
  };

  const handleProfileSkip = async () => {
    setShowProfileModal(false);
    if (user?.id) {
      await SecureStore.setItemAsync(`profile_skipped_${user.id}`, 'true');
    }
  };

  const getPhotoUrl = (albumId: string, photoId: string) => {
    return `${api.defaults.baseURL}/albums/${albumId}/photos/${photoId}/raw`;
  };

  const renderPill = (status: string) => {
    const cfg = STATUS_PILL[status] || STATUS_PILL.created;
    return (
      <View style={[styles.pill, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
        <Text style={[styles.pillText, { color: cfg.color }]}>{cfg.label}</Text>
      </View>
    );
  };

  return (
    <AnimatedBackground
      orbs={[ { color: 'rgba(123,92,245,0.12)', size: 180, top: -20, right: -30 } ]}
    >
      <View style={styles.container}>
        <View style={[styles.content, { paddingTop: Math.max(insets.top + 10, 50) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greetingText}>{getGreeting()}</Text>
              <Text style={styles.nameText}>Hey, {displayName}</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('Settings' as any)}>
              <LinearGradient
                colors={palette.gradient.hero}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.avatar}
              >
                <Text style={styles.avatarText}>{avatarLetter}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Create button */}
          <TouchableOpacity style={styles.createBtn} onPress={() => navigation.navigate('Upload' as any)}>
            <LinearGradient colors={palette.gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.createBtnGradient}>
              <Svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <Circle cx="9" cy="9" r="8" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2"/>
                <Path d="M9 5v8M5 9h8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
              </Svg>
              <Text style={styles.createBtnText}>Create album cluster</Text>
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Recent albums</Text>

          {/* Album List */}
          <ScrollView 
            style={styles.list} 
            showsVerticalScrollIndicator={false} 
            contentContainerStyle={{ gap: 8, paddingBottom: 20 }}
            refreshControl={
              <RefreshControl refreshing={isLoading && albums.length > 0} onRefresh={refreshAlbums} tintColor={palette.violet2} />
            }
          >
            {isLoading && albums.length === 0 ? (
              <View style={{ gap: 8 }}>
                {[1, 2, 3].map(i => (
                  <GlassCard key={i} style={styles.albumCard}>
                    <SkeletonLoader width={48} height={48} borderRadius={16} />
                    <View style={{ flex: 1, gap: 6, marginLeft: 16 }}>
                      <SkeletonLoader width="60%" height={16} />
                      <SkeletonLoader width="40%" height={12} />
                    </View>
                  </GlassCard>
                ))}
              </View>
            ) : albums.length === 0 ? (
              <EmptyState 
                iconType="album"
                title="No albums yet"
                subtitle="Create your first album and upload photos to see the magic happen."
              />
            ) : (
              albums.map((album, i) => {
                const grad = GRAD_COLORS[i % GRAD_COLORS.length] as [string, string];
                const isFailed = album.status === 'failed';
                return (
                  <TouchableOpacity
                    key={album.album_id}
                    onPress={() => {
                      if (album.status === 'complete') {
                        navigation.navigate('Clusters' as any, { albumId: album.album_id });
                      } else if (album.status === 'clustering' || album.status === 'created') {
                        navigation.navigate('Processing' as any, { albumId: album.album_id });
                      } else {
                        setConfirmModal({
                          visible: true,
                          title: 'Not Ready',
                          message: 'This album is currently uploading or has failed.',
                          confirmText: 'OK',
                          hideCancel: true,
                          onConfirm: closeConfirm
                        });
                      }
                    }}
                  >
                    <GlassCard style={styles.albumCard}>
                      {album.thumbnail_photo_id && authToken ? (
                        <AuthImage
                          url={getPhotoUrl(album.album_id, album.thumbnail_photo_id)}
                          style={[styles.albumIconBox, { backgroundColor: palette.glass, borderWidth: 0 }]}
                          resizeMode="cover"
                        />
                      ) : isFailed ? (
                        <View style={[styles.albumIconBox, { backgroundColor: 'rgba(255,80,80,0.1)', borderColor: 'rgba(255,80,80,0.2)', borderWidth: 1 }]}>
                          <Svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <Path d="M9 5v5M9 13h.01" stroke="#FF7070" strokeWidth="1.6" strokeLinecap="round"/>
                            <Circle cx="9" cy="9" r="8" stroke="#FF7070" strokeWidth="1.2"/>
                          </Svg>
                        </View>
                      ) : (
                        <LinearGradient colors={grad} style={styles.albumIconBox}>
                          <Svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <Rect x="2" y="5" width="16" height="12" rx="2" stroke="rgba(200,208,224,0.6)" strokeWidth="1.2"/>
                            <Circle cx="7" cy="3" r="1" fill="rgba(200,208,224,0.4)"/>
                            <Circle cx="13" cy="3" r="1" fill="rgba(200,208,224,0.4)"/>
                          </Svg>
                        </LinearGradient>
                      )}
                      <View style={styles.albumInfo}>
                        <Text style={styles.albumTitle}>{album.name}</Text>
                        <Text style={styles.albumDesc}>
                          {album.total_photos} photos{album.total_faces > 0 ? ` · ${album.total_faces} faces` : ''}
                        </Text>
                      </View>
                      {album.status === 'uploading' ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {renderPill('uploading')}
                          <TouchableOpacity onPress={() => {
                            setConfirmModal({
                              visible: true,
                              title: 'Remove Album',
                              message: 'Cancel upload and remove this album?',
                              confirmText: 'Remove',
                              isDestructive: true,
                              onConfirm: async () => {
                                closeConfirm();
                                await removeUploadingAlbum(album.album_id);
                              }
                            });
                          }}>
                            <View style={[styles.pill, { backgroundColor: 'rgba(255,80,80,0.1)' }]}>
                              <Text style={[styles.pillText, { color: '#FF7070' }]}>✕ Remove</Text>
                            </View>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        renderPill(album.status)
                      )}
                    </GlassCard>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>

        <MockupBottomTabs activeTab="home" />
      </View>

      <ConfirmModal
        visible={confirmModal.visible}
        title={confirmModal.title}
        message={confirmModal.message}
        onCancel={closeConfirm}
        onConfirm={confirmModal.onConfirm}
        isDestructive={confirmModal.isDestructive}
        cancelText={confirmModal.cancelText}
        confirmText={confirmModal.confirmText}
        hideCancel={confirmModal.hideCancel}
      />

      <ProfileSetupModal
        visible={showProfileModal}
        onComplete={handleProfileComplete}
        onSkip={handleProfileSkip}
      />
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  greetingText: { fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400') },
  nameText: { fontFamily: getFont('Syne', '800'), fontSize: 18, color: palette.silver2 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: getFont('Syne', '800'), fontSize: 14, color: '#fff' },

  createBtn: { marginBottom: 18, borderRadius: 16, overflow: 'hidden' },
  createBtnGradient: { paddingVertical: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  createBtnText: { color: '#fff', fontFamily: getFont('Syne', '700'), fontSize: 15, letterSpacing: 0.3 },

  sectionTitle: { fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400'), marginBottom: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  list: { flex: 1 },

  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyText: { color: palette.muted, fontFamily: getFont('DMSans', '400'), fontSize: 13, textAlign: 'center' },

  albumCard: { padding: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  albumIconBox: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: palette.border2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  albumInfo: { flex: 1 },
  albumTitle: { fontFamily: getFont('Syne', '700'), fontSize: 13, color: palette.silver2 },
  albumDesc: { fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400'), marginTop: 2 },

  pill: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: 10, fontFamily: getFont('DMSans', '500') }
});
