import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Modal, RefreshControl } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

// Standardizing to the AnimatedBackground component
import AnimatedBackground from '../../components/AnimatedBackground';
import GlassCard from '../../components/GlassCard';
import MockupBottomTabs from '../../components/MockupBottomTabs';
import SkeletonLoader from '../../components/SkeletonLoader';
import EmptyState from '../../components/EmptyState';
import ConfirmModal from '../../components/ConfirmModal';
import FaceAvatar from '../../components/FaceAvatar';
import AuthImage from '../../components/AuthImage';
import { getClusters, ClustersResponse, ClusterInfo } from '../../services/clusters';
import { deleteAlbum, renameAlbum, getAlbumPhotos, AlbumPhoto } from '../../services/albums';
import api from '../../services/api';
import { useAlbums } from '../../context/AlbumContext';
import { palette, getFont } from '../../theme';
import { RootStackParamList } from '../../types';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Clusters'>;
type RoutePropType = RouteProp<RootStackParamList, 'Clusters'>;

const GRAD_COLORS = [
  ['rgba(123,92,245,0.4)', 'rgba(0,212,255,0.3)'],
  ['rgba(0,212,255,0.3)',  'rgba(77,235,160,0.2)'],
  ['rgba(255,208,96,0.2)', 'rgba(123,92,245,0.2)'],
  ['rgba(77,235,160,0.2)', 'rgba(0,212,255,0.3)'],
];

export default function ClustersScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const [albumId, setAlbumId] = useState<string | undefined>(route.params?.albumId);

  // We need albums context for the selection screen
  const { albums, refreshAlbums } = useAlbums();
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

  const closeConfirm = () => setConfirmModal(prev => ({ ...prev, visible: false }));

  const completedAlbums = albums.filter(a => a.status === 'complete');

  const [data, setData] = useState<ClustersResponse | null>(null);
  const [albumPhotos, setAlbumPhotos] = useState<AlbumPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortBySize, setSortBySize] = useState(false);
  const [activeTab, setActiveTab] = useState<'faces' | 'photos'>('faces');

  const currentAlbum = albums.find(a => a.album_id === albumId);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');

  useEffect(() => {
    if (albumId) {
      fetchData();
      setNewAlbumName(currentAlbum?.name || '');
    }
  }, [albumId, currentAlbum?.name]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await getClusters(albumId!);
      setData(res);
      const photosRes = await getAlbumPhotos(albumId!);
      setAlbumPhotos(photosRes);
    } catch (e) {
      console.error('Failed to fetch clusters/photos', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAlbum = () => {
    setConfirmModal({
      visible: true,
      title: 'Delete Album',
      message: 'Are you sure you want to completely delete this album? This cannot be undone.',
      confirmText: 'Delete',
      isDestructive: true,
      onConfirm: async () => {
        closeConfirm();
        if (!albumId) return;
        try {
          await deleteAlbum(albumId);
          await refreshAlbums();
          if (route.params?.albumId) {
            navigation.navigate('Home' as any);
          } else {
            setAlbumId(undefined);
          }
        } catch (e) {
          setTimeout(() => {
            setConfirmModal({
              visible: true,
              title: 'Error',
              message: 'Failed to delete album',
              confirmText: 'OK',
              hideCancel: true,
              onConfirm: closeConfirm
            });
          }, 500);
        }
      }
    });
  };

  const handleRenameAlbum = async () => {
    if (!newAlbumName.trim() || !albumId) return;
    try {
      setLoading(true);
      await renameAlbum(albumId, newAlbumName.trim());
      await refreshAlbums();
      setIsRenameModalOpen(false);
    } catch (e) {
      setConfirmModal({
        visible: true,
        title: 'Error',
        message: 'Failed to rename album',
        confirmText: 'OK',
        hideCancel: true,
        onConfirm: closeConfirm
      });
    } finally {
      setLoading(false);
    }
  };

  if (!albumId) {
    // RENDER ALBUM SELECTION SCREEN
    return (
      <AnimatedBackground>
        <View style={{ flex: 1 }}>
          <View style={styles.content}>
            <View style={styles.topBar}>
              <Text style={[styles.headerTitle, { fontSize: 20, marginTop: 10 }]}>Your Albums</Text>
            </View>
            <Text style={[styles.headerSub, { marginBottom: 20 }]}>Select an album to view its face clusters</Text>
            
            {completedAlbums.length === 0 ? (
              <View style={styles.center}>
                <Text style={{ color: palette.muted, fontFamily: getFont('DMSans', '400') }}>
                  No completed albums found.{'\n'}Process an album first to view clusters.
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 20 }}>
                {completedAlbums.map((album, i) => {
                  const grad = GRAD_COLORS[i % GRAD_COLORS.length];
                  // If we don't have thumbnail_photo_id in the completedAlbums context object,
                  // we'll try to get it from the full albums list
                  const fullAlbum = albums.find(a => a.album_id === album.album_id);
                  const thumbId = (album as any).thumbnail_photo_id || fullAlbum?.thumbnail_photo_id;

                  const getPhotoUrl = (aId: string, pId: string) => {
                    return `${api.defaults.baseURL}/albums/${aId}/photos/${pId}/raw`;
                  };

                  return (
                    <TouchableOpacity key={album.album_id} onPress={() => setAlbumId(album.album_id)}>
                      <GlassCard style={{ padding: 0, overflow: 'hidden', borderRadius: 20 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
                          {/* Album visual strip */}
                          {thumbId ? (
                            <AuthImage
                              url={getPhotoUrl(album.album_id, thumbId)}
                              style={{ width: 80, height: '100%' }}
                              resizeMode="cover"
                            />
                          ) : (
                            <LinearGradient colors={grad} style={{ width: 80, justifyContent: 'center', alignItems: 'center' }}>
                              <Svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                                <Path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </Svg>
                            </LinearGradient>
                          )}
                          
                          {/* Content */}
                          <View style={{ flex: 1, padding: 18, justifyContent: 'center' }}>
                            <Text style={{ fontFamily: getFont('Syne', '700'), fontSize: 16, color: palette.silver2, marginBottom: 6 }}>
                              {album.name}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <Text style={{ fontFamily: getFont('DMSans', '500'), fontSize: 11, color: palette.violet2 }}>
                                {album.total_faces} faces
                              </Text>
                              <Text style={{ fontFamily: getFont('DMSans', '400'), fontSize: 11, color: palette.muted }}>
                                {album.total_photos} photos
                              </Text>
                            </View>
                          </View>
                          
                          <View style={{ paddingRight: 20, justifyContent: 'center' }}>
                            <Svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                              <Path d="M6 4l4 4-4 4" stroke={palette.border2} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </Svg>
                          </View>
                        </View>
                      </GlassCard>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
          <MockupBottomTabs activeTab="albums" />
        </View>
      </AnimatedBackground>
    );
  }

  if (loading || !data) {
    return (
      <AnimatedBackground>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.violet2} />
        </View>
      </AnimatedBackground>
    );
  }

  const clusters = data?.clusters || [];
  const unidentifiedCount = data?.unidentified_count || 0;
  
  // Sort clusters: "Me" always first, then by size if requested
  const sortedClusters = [...clusters].sort((a, b) => {
    if (a.is_me) return -1;
    if (b.is_me) return 1;
    if (sortBySize) return b.face_count - a.face_count;
    return 0; // maintain original alphabetical order if not sorting by size
  });

  return (
    <AnimatedBackground>
      <View style={{ flex: 1 }}>
        <View style={styles.content}>
          
          <View style={styles.topBar}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <TouchableOpacity style={styles.backBtn} onPress={() => {
                if (route.params?.albumId) {
                  navigation.goBack();
                } else {
                  setAlbumId(undefined);
                }
              }}>
                <Svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <Path d="M10 3L5 8l5 5" stroke={palette.silver} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </Svg>
              </TouchableOpacity>
              <View>
                <Text style={styles.headerTitle}>{currentAlbum?.name || 'Cluster results'}</Text>
                <Text style={styles.headerSub}>
                  {clusters.length} people identified · {unidentifiedCount} unidentified
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={() => setIsRenameModalOpen(true)} style={{ padding: 8 }}>
                <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <Path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke={palette.silver} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <Path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke={palette.silver} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </Svg>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDeleteAlbum} style={{ padding: 8 }}>
                <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <Path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="#FF453A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </Svg>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.filterRow}>
            <View style={{ flexDirection: 'row', gap: 6, flex: 1 }}>
              <TouchableOpacity
                style={[styles.filterPillGhost, activeTab === 'faces' && { backgroundColor: 'rgba(123,92,245,0.18)', borderColor: 'rgba(123,92,245,0.3)' }]}
                onPress={() => setActiveTab('faces')}
              >
                <Text style={[styles.filterPillGhostText, activeTab === 'faces' && { color: palette.violet2, fontFamily: getFont('DMSans', '500') }]}>
                  Faces ({clusters.length + (unidentifiedCount > 0 ? 1 : 0)})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterPillGhost, activeTab === 'photos' && { backgroundColor: 'rgba(123,92,245,0.18)', borderColor: 'rgba(123,92,245,0.3)' }]}
                onPress={() => setActiveTab('photos')}
              >
                <Text style={[styles.filterPillGhostText, activeTab === 'photos' && { color: palette.violet2, fontFamily: getFont('DMSans', '500') }]}>
                  Photos ({albumPhotos.length})
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.filterPillGhost, sortBySize && { backgroundColor: 'rgba(123,92,245,0.12)', borderColor: 'rgba(123,92,245,0.3)' }]}
              onPress={() => setSortBySize(v => !v)}
            >
              <Text style={[styles.filterPillGhostText, sortBySize && { color: palette.violet2 }]}>By size</Text>
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={styles.grid} 
            contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 20 }}
            refreshControl={
              <RefreshControl refreshing={loading && clusters.length > 0} onRefresh={fetchData} tintColor={palette.violet2} />
            }
          >
            {activeTab === 'photos' ? (
              albumPhotos.length === 0 ? (
                <EmptyState 
                  iconType="cluster"
                  title="No photos found"
                  subtitle="This album has no photos yet."
                />
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2, paddingHorizontal: 2 }}>
                  {albumPhotos.map((photo) => (
                    <View key={photo.photo_id} style={{ width: '32.5%', aspectRatio: 1, marginBottom: 2 }}>
                      <AuthImage 
                        url={`${api.defaults.baseURL?.replace('/api/v1', '')}${photo.encrypted_blob_url}`}
                        style={{ flex: 1, borderRadius: 4, backgroundColor: palette.card }}
                        resizeMode="cover"
                      />
                    </View>
                  ))}
                </View>
              )
            ) : (
              <>
                {loading && clusters.length === 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' }}>
                    {[1, 2, 3, 4, 5, 6].map(i => (
                      <View key={i} style={styles.gridCardPress}>
                        <GlassCard style={styles.gridCard}>
                          <SkeletonLoader width={52} height={52} borderRadius={26} />
                          <SkeletonLoader width={80} height={14} style={{ marginTop: 12 }} />
                          <SkeletonLoader width={50} height={10} style={{ marginTop: 4 }} />
                        </GlassCard>
                      </View>
                    ))}
                  </View>
                ) : clusters.length === 0 && unidentifiedCount === 0 ? (
                  <EmptyState 
                    iconType="cluster"
                    title="No clusters found"
                    subtitle="This album might not have any faces, or clustering failed."
                  />
                ) : (
                  <>
                    {sortedClusters.map((cluster, i) => {
                      const grad = GRAD_COLORS[i % GRAD_COLORS.length] as [string, string];
                      const isUnidentified = cluster.cluster_label === -1;
                      return (
                        <TouchableOpacity
                          key={cluster.cluster_label}
                          style={styles.gridCardPress}
                          onPress={() => navigation.navigate('ClusterDetail' as any, {
                            albumId,
                            clusterLabel: cluster.cluster_label,
                            displayName: isUnidentified ? 'Unidentified' : cluster.display_name
                          })}
                        >
                          <View style={[styles.polaroidCard, isUnidentified && { borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 }]}>
                            <View style={styles.polaroidImageContainer}>
                              {cluster.representative_face ? (
                                <FaceAvatar
                                  albumId={albumId!}
                                  photoId={cluster.representative_face.photo_id}
                                  bbox={cluster.representative_face.bbox}
                                  size={250} // Make large enough to fill container
                                  borderRadius={0}
                                />
                              ) : (
                                <LinearGradient colors={isUnidentified ? ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)'] : grad} style={StyleSheet.absoluteFill}>
                                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                    {isUnidentified ? (
                                      <Svg width="30" height="30" viewBox="0 0 20 20" fill="none">
                                        <Circle cx="10" cy="7" r="3.5" stroke="rgba(200,208,224,0.3)" strokeWidth="1.3"/>
                                        <Path d="M3 18c0-3.31 3.13-6 7-6" stroke="rgba(200,208,224,0.3)" strokeWidth="1.3" strokeLinecap="round"/>
                                        <Path d="M15 14l2 2 3-3" stroke="rgba(200,208,224,0.3)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                                      </Svg>
                                    ) : (
                                      <Text style={{ fontSize: 32 }}>{cluster.display_name.includes('Person') ? '🔍' : '👤'}</Text>
                                    )}
                                  </View>
                                </LinearGradient>
                              )}
                            </View>
                            <LinearGradient 
                              colors={['transparent', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)']} 
                              style={styles.polaroidBottomBar}
                            >
                              <Text style={[styles.polaroidName, isUnidentified && { color: palette.muted }]} numberOfLines={1}>
                                {isUnidentified ? 'Unidentified' : cluster.display_name}
                              </Text>
                              <Text style={styles.polaroidSub}>
                                {cluster.photo_count ?? cluster.face_count} {isUnidentified ? 'faces' : 'photos'}
                              </Text>
                            </LinearGradient>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}
              </>
            )}

          </ScrollView>

          {/* Rename Modal */}
          <Modal visible={isRenameModalOpen} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Rename Album</Text>
                <TextInput
                  style={styles.modalInput}
                  autoFocus
                  value={newAlbumName}
                  onChangeText={setNewAlbumName}
                  placeholder="Enter album name"
                  placeholderTextColor={palette.muted}
                  returnKeyType="done"
                  onSubmitEditing={handleRenameAlbum}
                />
                <View style={styles.modalButtons}>
                  <TouchableOpacity onPress={() => { setIsRenameModalOpen(false); setNewAlbumName(currentAlbum?.name || ''); }} style={styles.modalCancel}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleRenameAlbum} style={styles.modalConfirm}>
                    <Text style={styles.modalConfirmText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

        </View>

        <MockupBottomTabs activeTab="albums" />
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
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 60 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  backBtn: { width: 36, height: 36, backgroundColor: palette.glass2, borderWidth: 1, borderColor: palette.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: getFont('Syne', '800'), fontSize: 15, color: palette.silver2 },
  headerSub: { fontSize: 10, color: palette.muted, fontFamily: getFont('DMSans', '400') },

  filterRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  filterPill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1 },
  filterPillGhost: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, backgroundColor: palette.glass, borderColor: palette.border },
  filterPillGhostText: { color: palette.muted, fontSize: 11, fontFamily: getFont('DMSans', '400') },

  grid: { flex: 1 },
  gridCardPress: { width: '48.5%', marginBottom: 12 },
  
  // Polaroid styles
  polaroidCard: {
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: palette.card,
    position: 'relative'
  },
  polaroidImageContainer: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  polaroidBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    paddingTop: 24,
  },
  polaroidName: {
    fontFamily: getFont('Syne', '700'),
    fontSize: 14,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  polaroidSub: {
    fontFamily: getFont('DMSans', '500'),
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // (Keeping old gridCard styles around in case they are used elsewhere, though they shouldn't be)
  gridCard: { padding: 12, alignItems: 'center', height: 'auto' },
  avatarBox: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emojiText: { fontSize: 22 },
  nameText: { fontFamily: getFont('Syne', '700'), fontSize: 12, color: palette.silver2, textAlign: 'center' },
  countText: { fontSize: 10, color: palette.muted, fontFamily: getFont('DMSans', '400'), marginVertical: 4 },
  
  pill: { paddingVertical: 2, paddingHorizontal: 7, borderRadius: 10, borderWidth: 1 },
  pillText: { fontSize: 9, fontFamily: getFont('DMSans', '500') },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', backgroundColor: '#1C1C23', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: palette.border2 },
  modalTitle: { color: palette.silver2, fontFamily: getFont('Syne', '700'), fontSize: 16, marginBottom: 16 },
  modalInput: { backgroundColor: palette.glass, color: palette.silver2, fontFamily: getFont('DMSans', '400'), padding: 14, borderRadius: 12, borderWidth: 1, borderColor: palette.border, fontSize: 14, marginBottom: 20 },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalCancel: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 12, backgroundColor: palette.glass },
  modalCancelText: { color: palette.muted, fontFamily: getFont('Syne', '700') },
  modalConfirm: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 12, backgroundColor: palette.violet2 },
  modalConfirmText: { color: '#fff', fontFamily: getFont('Syne', '700') },
});
