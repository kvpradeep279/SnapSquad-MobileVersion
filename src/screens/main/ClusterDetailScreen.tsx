import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image,
  ActivityIndicator, Alert, TextInput, Modal, Dimensions
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { getFirebaseIdToken } from '../../services/auth';
import AnimatedBackground from '../../components/AnimatedBackground';
import ConfirmModal from '../../components/ConfirmModal';
import FaceAvatar from '../../components/FaceAvatar';
import ImageViewerModal from '../../components/ImageViewerModal';
import { getClusterPhotos, getUnidentifiedFaces, renameCluster, deletePhotos, ejectPhotos, deleteCluster, promoteUnidentifiedFaces, deleteFace, mergeFace, createClusterFromFace, getClusters } from '../../services/clusters';
import api from '../../services/api';
import { palette, getFont } from '../../theme';
import { RootStackParamList } from '../../types';
import { useAlbums } from '../../context/AlbumContext';
import { downloadPhotos } from '../../utils/export';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'ClusterDetail'>;
type RoutePropType = RouteProp<RootStackParamList, 'ClusterDetail'>;

const SCREEN_WIDTH = Dimensions.get('window').width;
const CELL_SIZE = (SCREEN_WIDTH - 40 - 10) / 3;

export default function ClusterDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { albumId, clusterLabel, displayName: initialName } = route.params!;

  const [photos, setPhotos] = useState<any[]>([]);
  const [unidentifiedFaces, setUnidentifiedFaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState(initialName || `Person ${clusterLabel}`);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isPromoteModalOpen, setIsPromoteModalOpen] = useState(false);
  const [newName, setNewName] = useState(displayName);
  const [promoteName, setPromoteName] = useState('');
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Triage state
  const [triageFace, setTriageFace] = useState<any | null>(null);
  const [triageMergeCluster, setTriageMergeCluster] = useState<number | null>(null);
  const [triageNewName, setTriageNewName] = useState('');
  const [availableClusters, setAvailableClusters] = useState<any[]>([]);
  const [isTriageCreating, setIsTriageCreating] = useState(false);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);
  const [viewerImages, setViewerImages] = useState<string[]>([]);

  const { refreshAlbums } = useAlbums();

  // Selection mode state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  
  // Download state
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ done: 0, total: 0 });

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

  useEffect(() => {
    const init = async () => {
      const token = await getFirebaseIdToken();
      setAuthToken(token);
      await fetchPhotos(token);
    };
    init();
  }, [albumId, clusterLabel]);

  useEffect(() => {
    setNewName(displayName);
  }, [displayName]);

  const fetchPhotos = async (token: string | null) => {
    setLoading(true);
    try {
      if (clusterLabel === -1) {
        const [facesRes, clustersRes] = await Promise.all([
          getUnidentifiedFaces(albumId),
          getClusters(albumId)
        ]);
        setUnidentifiedFaces(facesRes);
        // Exclude Unidentified (-1) from the merge targets
        setAvailableClusters(clustersRes.clusters.filter(c => c.cluster_label !== -1));
      } else {
        const res = await getClusterPhotos(albumId, clusterLabel);
        setPhotos(res.photo_urls);
      }
    } catch (e) {
      console.error('Failed to fetch cluster photos/faces', e);
    } finally {
      setLoading(false);
    }
  };

  const getPhotoUrl = (photoId: string) => {
    return `${api.defaults.baseURL}/albums/${albumId}/photos/${photoId}/raw`;
  };

  const getAuthHeaders = () =>
    authToken ? { Authorization: `Bearer ${authToken}` } : undefined;

  const handleRename = async () => {
    if (!newName.trim()) return;
    try {
      await renameCluster(albumId, clusterLabel, newName.trim());
      setDisplayName(newName.trim());
      setIsRenameModalOpen(false);
    } catch (e) {
      setConfirmModal({
        visible: true,
        title: 'Error',
        message: 'Failed to rename cluster. Please try again.',
        confirmText: 'OK',
        hideCancel: true,
        onConfirm: closeConfirm
      });
    }
  };

  const toggleSelectionMode = () => {
    if (isSelectionMode) {
      setIsSelectionMode(false);
      setSelectedPhotoIds(new Set());
    } else {
      setIsSelectionMode(true);
    }
  };

  const handlePhotoPress = (photoId: string, index: number) => {
    if (isSelectionMode) {
      setSelectedPhotoIds(prev => {
        const next = new Set(prev);
        if (next.has(photoId)) next.delete(photoId);
        else next.add(photoId);
        return next;
      });
    } else {
      setViewerImages(photos.map(p => getPhotoUrl(p.photo_id)));
      setViewerInitialIndex(index);
      setViewerVisible(true);
    }
  };

  const handleEject = async () => {
    if (selectedPhotoIds.size === 0) return;
    
    setConfirmModal({
      visible: true,
      title: 'Remove from Person',
      message: `Are you sure you want to remove ${selectedPhotoIds.size} photo(s) from this person? They will stay in the album as Unidentified.`,
      confirmText: 'Remove',
      isDestructive: true,
      onConfirm: async () => {
        closeConfirm();
        setLoading(true);
        try {
          await ejectPhotos(albumId, clusterLabel, Array.from(selectedPhotoIds));
          setIsSelectionMode(false);
          setSelectedPhotoIds(new Set());
          await fetchPhotos(authToken);
        } catch (e) {
          setTimeout(() => {
            setConfirmModal({
              visible: true, title: 'Error', message: 'Failed to remove photos. Please try again.', confirmText: 'OK', hideCancel: true, onConfirm: closeConfirm
            });
          }, 500);
          setLoading(false);
        }
      }
    });
  };

  // ── Face Triage Handlers ─────────────────────────────────────

  const handleTriageDelete = async () => {
    if (!triageFace) return;
    setConfirmModal({
      visible: true,
      title: 'Delete Face',
      message: 'Are you sure you want to completely delete this face data? This action cannot be undone.',
      confirmText: 'Delete',
      isDestructive: true,
      onConfirm: async () => {
        closeConfirm();
        setLoading(true);
        try {
          await deleteFace(albumId, triageFace.face_detection_id);
          setTriageFace(null);
          await fetchPhotos(authToken);
        } catch (e) {
          Alert.alert('Error', 'Failed to delete face.');
          setLoading(false);
        }
      }
    });
  };

  const handleTriageMerge = async () => {
    if (!triageFace || triageMergeCluster === null) return;
    setLoading(true);
    try {
      await mergeFace(albumId, triageFace.face_detection_id, triageMergeCluster);
      setTriageFace(null);
      setTriageMergeCluster(null);
      await fetchPhotos(authToken);
    } catch (e) {
      Alert.alert('Error', 'Failed to merge face.');
      setLoading(false);
    }
  };

  const handleTriageCreate = async () => {
    if (!triageFace || !triageNewName.trim()) return;
    setLoading(true);
    try {
      await createClusterFromFace(albumId, triageFace.face_detection_id, triageNewName.trim());
      setTriageFace(null);
      setIsTriageCreating(false);
      setTriageNewName('');
      await fetchPhotos(authToken);
    } catch (e) {
      Alert.alert('Error', 'Failed to create new person.');
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────

  const handlePromote = async () => {
    if (!promoteName.trim() || selectedPhotoIds.size === 0) return;
    try {
      setLoading(true);
      await promoteUnidentifiedFaces(albumId, Array.from(selectedPhotoIds), promoteName.trim());
      await fetchPhotos(authToken);
      setIsPromoteModalOpen(false);
      setIsSelectionMode(false);
      setSelectedPhotoIds(new Set());
      setPromoteName('');
    } catch (e) {
      setConfirmModal({
        visible: true,
        title: 'Error',
        message: 'Failed to promote faces. Please try again.',
        confirmText: 'OK',
        hideCancel: true,
        onConfirm: closeConfirm
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (selectedPhotoIds.size === 0) return;
    
    setConfirmModal({
      visible: true,
      title: 'Delete completely',
      message: `Are you sure you want to completely delete ${selectedPhotoIds.size} photo(s) from this album? This cannot be undone.`,
      confirmText: 'Delete',
      isDestructive: true,
      onConfirm: async () => {
        closeConfirm();
        setLoading(true);
        try {
          const res = await deletePhotos(albumId, Array.from(selectedPhotoIds));
          if (res.album_deleted) {
            setTimeout(() => {
              setConfirmModal({
                visible: true,
                title: 'Album Deleted',
                message: 'Because you deleted all photos, the empty album has been automatically deleted.',
                confirmText: 'OK',
                hideCancel: true,
                onConfirm: async () => {
                  closeConfirm();
                  await refreshAlbums();
                  navigation.navigate('Home' as any);
                }
              });
            }, 500);
          } else {
            await fetchPhotos(authToken);
            setIsSelectionMode(false);
            setSelectedPhotoIds(new Set());
          }
        } catch (e) {
          setTimeout(() => {
            setConfirmModal({
              visible: true, title: 'Error', message: 'Failed to delete photos.', confirmText: 'OK', hideCancel: true, onConfirm: closeConfirm
            });
          }, 500);
          setLoading(false);
        }
      }
    });
  };

  const handleDownload = async () => {
    if (selectedPhotoIds.size === 0) return;
    setDownloading(true);
    setDownloadProgress({ done: 0, total: selectedPhotoIds.size });
    await downloadPhotos(albumId, Array.from(selectedPhotoIds), (done, total) => {
      setDownloadProgress({ done, total });
    });
    setDownloading(false);
    setIsSelectionMode(false);
    setSelectedPhotoIds(new Set());
  };

  return (
    <AnimatedBackground orbs={[{ color: 'rgba(123,92,245,0.14)', size: 160, top: 60, right: -40 }]}>
      <View style={[styles.container, { paddingTop: Math.max(insets.top + 10, 60) }]}>

        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <Path d="M10 3L5 8l5 5" stroke={palette.silver} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </Svg>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isSelectionMode ? `${selectedPhotoIds.size} Selected` : 'Cluster detail'}</Text>
          <TouchableOpacity onPress={toggleSelectionMode} style={styles.selectBtn}>
            <Text style={styles.selectBtnText}>{isSelectionMode ? 'Cancel' : 'Select'}</Text>
          </TouchableOpacity>
        </View>

        {/* Profile row */}
        <View style={styles.profileRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.nameText} numberOfLines={1}>{displayName}</Text>
            <View style={styles.pillRow}>
              <Text style={styles.countText}>{clusterLabel === -1 ? unidentifiedFaces.length : photos.length} {clusterLabel === -1 ? 'faces' : 'photos'}</Text>
            </View>
          </View>
        </View>
        
        {/* Actions moved to top */}
        {!isSelectionMode && clusterLabel !== -1 && (
          <View style={styles.topActionsRow}>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => setIsRenameModalOpen(true)}>
              <Svg width="14" height="14" viewBox="0 0 15 15" fill="none">
                <Path d="M10.5 2.5l2 2-8 8H2.5v-2l8-8z" stroke={palette.silver} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </Svg>
              <Text style={styles.ghostText}>Rename</Text>
            </TouchableOpacity>

            {clusterLabel !== -1 && (
              <TouchableOpacity style={[styles.ghostBtn, { borderColor: 'rgba(255,69,58,0.3)', backgroundColor: 'rgba(255,69,58,0.1)' }]} onPress={() => {
                setConfirmModal({
                  visible: true,
                  title: 'Delete Cluster',
                  message: 'Are you sure you want to delete this cluster? This will move all faces to unidentified, but will NOT delete the photos.',
                  confirmText: 'Delete',
                  isDestructive: true,
                  onConfirm: async () => {
                    closeConfirm();
                    setLoading(true);
                    try {
                      await deleteCluster(albumId, clusterLabel);
                      navigation.goBack();
                    } catch (e) {
                      setTimeout(() => {
                        setConfirmModal({
                          visible: true, title: 'Error', message: 'Failed to delete cluster.', confirmText: 'OK', hideCancel: true, onConfirm: closeConfirm
                        });
                      }, 500);
                      setLoading(false);
                    }
                  }
                });
              }}>
                <Svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <Path d="M3 6H5H21" stroke={palette.tomato} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <Path d="M8 6V4C8 3.44772 8.44772 3 9 3H15C15.5523 3 16 3.44772 16 4V6M19 6V20C19 20.5523 18.5523 21 18 21H6C5.44772 21 5 20.5523 5 20V6H19Z" stroke={palette.tomato} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </Svg>
                <Text style={[styles.ghostText, { color: palette.tomato }]}>Delete Cluster</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Photo grid */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={palette.violet2} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.grid}>
            {clusterLabel === -1 ? (
              unidentifiedFaces.map((f) => {
                const isSelected = selectedPhotoIds.has(f.photo_id);
                return (
                  <TouchableOpacity
                    key={f.face_detection_id}
                    style={[styles.gridCell, isSelected && { borderColor: palette.violet2, borderWidth: 2 }]}
                    onPress={() => {
                      if (isSelectionMode) {
                        setSelectedPhotoIds(prev => {
                          const next = new Set(prev);
                          if (next.has(f.photo_id)) next.delete(f.photo_id);
                          else next.add(f.photo_id);
                          return next;
                        });
                      } else {
                        setTriageFace(f);
                        setTriageMergeCluster(null);
                        setIsTriageCreating(false);
                        setTriageNewName('');
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <FaceAvatar
                      albumId={albumId}
                      photoId={f.photo_id}
                      bbox={f.bbox}
                      size={CELL_SIZE}
                    />
                    {isSelected && isSelectionMode && (
                      <View style={{ position: 'absolute', top: 6, right: 6 }}>
                        <LinearGradient colors={palette.gradient.hero} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.checkBoxOn}>
                          <Svg width="14" height="14" viewBox="0 0 10 10" fill="none">
                            <Path d="M2 5l2.5 2.5 4-4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                          </Svg>
                        </LinearGradient>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            ) : (
              photos.map((p, index) => {
                const isSelected = selectedPhotoIds.has(p.photo_id);
                return (
                  <TouchableOpacity
                    key={p.photo_id}
                    style={[styles.gridCell, isSelected && { borderColor: palette.violet2, borderWidth: 2 }]}
                    onPress={() => handlePhotoPress(p.photo_id, index)}
                    activeOpacity={0.8}
                  >
                    {authToken ? (
                      <Image
                        source={{
                          uri: getPhotoUrl(p.photo_id),
                          headers: getAuthHeaders(),
                        }}
                        style={styles.image}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.image, { backgroundColor: palette.glass2, alignItems: 'center', justifyContent: 'center' }]}>
                        <ActivityIndicator size="small" color={palette.violet2} />
                      </View>
                    )}
                    {isSelected && isSelectionMode && (
                      <View style={{ position: 'absolute', top: 6, right: 6 }}>
                        <LinearGradient colors={palette.gradient.hero} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.checkBoxOn}>
                          <Svg width="14" height="14" viewBox="0 0 10 10" fill="none">
                            <Path d="M2 5l2.5 2.5 4-4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                          </Svg>
                        </LinearGradient>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
            {photos.length === 0 && unidentifiedFaces.length === 0 && (
              <View style={[styles.center, { width: '100%', marginTop: 40 }]}>
                <Text style={{ color: palette.muted, fontFamily: getFont('DMSans', '400') }}>No items found.</Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* Floating Action Bar for Selection Mode */}
        {isSelectionMode && (
          <View style={styles.selectionActionBar}>
            {clusterLabel === -1 ? (
              <TouchableOpacity 
                style={[styles.actionBtn, selectedPhotoIds.size === 0 && { opacity: 0.5 }]} 
                onPress={() => setIsPromoteModalOpen(true)}
                disabled={selectedPhotoIds.size === 0 || downloading}
              >
                <Text style={[styles.actionBtnText, { color: palette.violet2 }]}>Create Person</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity 
                  style={[styles.actionBtn, selectedPhotoIds.size === 0 && { opacity: 0.5 }]} 
                  onPress={handleDownload}
                  disabled={selectedPhotoIds.size === 0 || downloading}
                >
                  {downloading ? (
                    <ActivityIndicator size="small" color={palette.violet2} />
                  ) : (
                    <Text style={[styles.actionBtnText, { color: palette.violet2 }]}>Download</Text>
                  )}
                </TouchableOpacity>
                
                <View style={styles.actionDivider} />

                <TouchableOpacity 
                  style={[styles.actionBtn, selectedPhotoIds.size === 0 && { opacity: 0.5 }]} 
                  onPress={handleEject}
                  disabled={selectedPhotoIds.size === 0 || downloading}
                >
                  <Text style={styles.actionBtnText}>Remove</Text>
                </TouchableOpacity>
                
                <View style={styles.actionDivider} />
                
                <TouchableOpacity 
                  style={[styles.actionBtn, selectedPhotoIds.size === 0 && { opacity: 0.5 }]} 
                  onPress={handleDelete}
                  disabled={selectedPhotoIds.size === 0 || downloading}
                >
                  <Text style={[styles.actionBtnText, { color: '#FF453A' }]}>Delete</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

      {/* Triage Modal */}
      <Modal visible={!!triageFace} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Triage Face</Text>
            
            {triageFace && (
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <FaceAvatar
                  albumId={albumId}
                  photoId={triageFace.photo_id}
                  bbox={triageFace.bbox}
                  size={120}
                />
              </View>
            )}

            {!isTriageCreating ? (
              <>
                <Text style={[styles.headerSub, { marginBottom: 16, textAlign: 'center' }]}>What would you like to do with this face?</Text>
                
                {/* Create New Person */}
                <TouchableOpacity style={[styles.actionBtn, { flex: 0, borderRadius: 12, marginBottom: 10, borderColor: palette.violet2, borderWidth: 1 }]} onPress={() => setIsTriageCreating(true)}>
                  <Text style={[styles.actionBtnText, { color: palette.violet2 }]}>Create New Person</Text>
                </TouchableOpacity>
                
                {/* Merge into Existing */}
                {availableClusters.length > 0 && (
                  <View style={{ marginBottom: 10 }}>
                    <Text style={[styles.headerSub, { marginBottom: 6 }]}>Merge into existing:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                      {availableClusters.map(c => (
                        <TouchableOpacity
                          key={c.cluster_label}
                          style={[styles.filterPillGhost, { marginRight: 8 }, triageMergeCluster === c.cluster_label && { borderColor: palette.violet2, backgroundColor: 'rgba(123,92,245,0.1)' }]}
                          onPress={() => setTriageMergeCluster(c.cluster_label)}
                        >
                          <Text style={[styles.filterPillGhostText, triageMergeCluster === c.cluster_label && { color: palette.violet2 }]}>{c.display_name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    {triageMergeCluster !== null && (
                      <TouchableOpacity style={[styles.modalConfirm, { flex: 0, marginTop: 10 }]} onPress={handleTriageMerge}>
                        <Text style={styles.modalConfirmText}>Confirm Merge</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Delete Face */}
                <TouchableOpacity style={[styles.actionBtn, { flex: 0, borderRadius: 12, marginTop: 10, backgroundColor: 'rgba(255, 69, 58, 0.1)' }]} onPress={handleTriageDelete}>
                  <Text style={[styles.actionBtnText, { color: palette.tomato }]}>Delete Face Data</Text>
                </TouchableOpacity>

                {/* Cancel */}
                <TouchableOpacity style={[styles.modalCancel, { flex: 0, marginTop: 16 }]} onPress={() => { setTriageFace(null); setTriageMergeCluster(null); }}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[styles.headerSub, { marginBottom: 16, textAlign: 'center' }]}>Name this new person:</Text>
                <TextInput
                  style={styles.modalInput}
                  autoFocus
                  value={triageNewName}
                  onChangeText={setTriageNewName}
                  placeholder="Enter name"
                  placeholderTextColor={palette.muted}
                />
                <View style={styles.modalButtons}>
                  <TouchableOpacity onPress={() => setIsTriageCreating(false)} style={styles.modalCancel}>
                    <Text style={styles.modalCancelText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleTriageCreate} style={styles.modalConfirm} disabled={!triageNewName.trim()}>
                    <Text style={styles.modalConfirmText}>Create</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            
          </View>
        </View>
      </Modal>

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

      {/* Rename Modal */}
      <Modal visible={isRenameModalOpen} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Rename person</Text>
              <TextInput
                style={styles.modalInput}
                autoFocus
                value={newName}
                onChangeText={setNewName}
                placeholder="Enter name"
                placeholderTextColor={palette.muted}
                returnKeyType="done"
                onSubmitEditing={handleRename}
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity onPress={() => { setIsRenameModalOpen(false); setNewName(displayName); }} style={styles.modalCancel}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRename} style={styles.modalConfirm}>
                  <Text style={styles.modalConfirmText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
      </Modal>

      {/* Promote Modal */}
      <Modal visible={isPromoteModalOpen} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Group Selected Faces</Text>
              <Text style={{ color: palette.muted, marginBottom: 16, fontFamily: getFont('DMSans', '400') }}>
                These faces will be grouped into a new person. Enter a name for this person.
              </Text>
              <TextInput
                style={styles.modalInput}
                autoFocus
                value={promoteName}
                onChangeText={setPromoteName}
                placeholder="Enter name (e.g. John)"
                placeholderTextColor={palette.muted}
                returnKeyType="done"
                onSubmitEditing={handlePromote}
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity onPress={() => { setIsPromoteModalOpen(false); setPromoteName(''); }} style={styles.modalCancel}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handlePromote} style={styles.modalConfirm}>
                  <Text style={styles.modalConfirmText}>Create Person</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
      </Modal>

        {/* Full-screen photo preview modal */}
        <ImageViewerModal
          visible={viewerVisible}
          images={viewerImages}
          initialIndex={viewerInitialIndex}
          onClose={() => setViewerVisible(false)}
        />

      </View>
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 16 },
  backBtn: { width: 36, height: 36, backgroundColor: palette.glass2, borderWidth: 1, borderColor: palette.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: getFont('Syne', '800'), fontSize: 16, color: palette.silver2 },
  selectBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: palette.glass2, borderRadius: 12, borderWidth: 1, borderColor: palette.border },
  selectBtnText: { color: palette.violet2, fontFamily: getFont('Syne', '700'), fontSize: 13 },

  profileRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 14, marginBottom: 16 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22 },
  nameText: { fontFamily: getFont('Syne', '700'), fontSize: 18, color: palette.silver2 },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  countText: { fontSize: 12, color: palette.muted, fontFamily: getFont('DMSans', '400') },

  topActionsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 16 },
  ghostBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: palette.glass, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: palette.border },
  ghostText: { color: palette.silver2, fontSize: 12, fontFamily: getFont('Syne', '700') },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, paddingHorizontal: 20, paddingBottom: 100 }, // extra padding for bottom bar
  gridCell: { width: CELL_SIZE, height: CELL_SIZE, borderRadius: 10, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  checkBoxOn: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  selectionActionBar: { position: 'absolute', bottom: 30, left: 20, right: 20, flexDirection: 'row', backgroundColor: 'rgba(25,25,35,0.95)', borderRadius: 16, borderWidth: 1, borderColor: palette.border2, overflow: 'hidden' },
  actionBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  actionBtnText: { color: palette.silver, fontSize: 13, fontFamily: getFont('Syne', '700') },
  actionDivider: { width: 1, backgroundColor: palette.border2, marginVertical: 10 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', backgroundColor: '#1C1C23', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: palette.border2 },
  modalTitle: { color: palette.silver2, fontFamily: getFont('Syne', '700'), fontSize: 16, marginBottom: 16 },
  modalInput: { backgroundColor: palette.glass, color: palette.silver2, fontFamily: getFont('DMSans', '400'), padding: 14, borderRadius: 12, borderWidth: 1, borderColor: palette.border, fontSize: 14, marginBottom: 20 },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalCancel: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 12, backgroundColor: palette.glass },
  modalCancelText: { color: palette.muted, fontFamily: getFont('Syne', '700') },
  modalConfirm: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 12, backgroundColor: palette.violet2 },
  modalConfirmText: { color: '#fff', fontFamily: getFont('Syne', '700') },

  previewOverlay: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  previewClose: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 },
  previewImage: { width: '100%', height: '100%' },

  headerSub: { color: palette.silver2, fontFamily: getFont('DMSans', '500'), fontSize: 14 },
  filterPillGhost: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.glass },
  filterPillGhostText: { color: palette.muted, fontFamily: getFont('Syne', '700'), fontSize: 13 },
});
