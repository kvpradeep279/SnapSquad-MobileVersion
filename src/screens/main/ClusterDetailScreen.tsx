import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image,
  ActivityIndicator, Alert, TextInput, Modal, Dimensions
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import AnimatedBackground from '../../components/AnimatedBackground';
import { getClusterPhotos, renameCluster, deletePhotos, ejectPhotos } from '../../services/clusters';
import api from '../../services/api';
import { palette, getFont } from '../../theme';
import { RootStackParamList } from '../../types';
import { useAlbums } from '../../context/AlbumContext';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'ClusterDetail'>;
type RoutePropType = RouteProp<RootStackParamList, 'ClusterDetail'>;

const SCREEN_WIDTH = Dimensions.get('window').width;
const CELL_SIZE = (SCREEN_WIDTH - 40 - 10) / 3;

export default function ClusterDetailScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { albumId, clusterLabel, displayName: initialName } = route.params!;

  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState(initialName || `Person ${clusterLabel}`);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [newName, setNewName] = useState(displayName);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const { refreshAlbums } = useAlbums();

  const [previewUri, setPreviewUri] = useState<string | null>(null);

  // Selection mode state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const init = async () => {
      const token = await SecureStore.getItemAsync('auth_token');
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
      const res = await getClusterPhotos(albumId, clusterLabel);
      setPhotos(res.photo_urls);
    } catch (e) {
      console.error('Failed to fetch cluster photos', e);
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
      Alert.alert('Error', 'Failed to rename cluster. Please try again.');
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

  const handlePhotoPress = (photoId: string) => {
    if (isSelectionMode) {
      setSelectedPhotoIds(prev => {
        const next = new Set(prev);
        if (next.has(photoId)) next.delete(photoId);
        else next.add(photoId);
        return next;
      });
    } else {
      setPreviewUri(getPhotoUrl(photoId));
    }
  };

  const handleEject = async () => {
    if (selectedPhotoIds.size === 0) return;
    
    Alert.alert(
      "Remove from Person",
      `Are you sure you want to remove ${selectedPhotoIds.size} photo(s) from this person? They will stay in the album as Unidentified.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              await ejectPhotos(albumId, clusterLabel, Array.from(selectedPhotoIds));
              await fetchPhotos(authToken);
              setIsSelectionMode(false);
              setSelectedPhotoIds(new Set());
            } catch (e) {
              Alert.alert('Error', 'Failed to remove photos.');
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleDelete = async () => {
    if (selectedPhotoIds.size === 0) return;
    
    Alert.alert(
      "Delete completely",
      `Are you sure you want to completely delete ${selectedPhotoIds.size} photo(s) from this album? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              const res = await deletePhotos(albumId, Array.from(selectedPhotoIds));
              if (res.album_deleted) {
                Alert.alert(
                  'Album Deleted', 
                  'Because you deleted all photos, the empty album has been automatically deleted.',
                  [{ text: "OK", onPress: async () => {
                    await refreshAlbums();
                    navigation.navigate('Home' as any);
                  }}]
                );
              } else {
                await fetchPhotos(authToken);
                setIsSelectionMode(false);
                setSelectedPhotoIds(new Set());
              }
            } catch (e) {
              Alert.alert('Error', 'Failed to delete photos.');
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  return (
    <AnimatedBackground orbs={[{ color: 'rgba(123,92,245,0.14)', size: 160, top: 60, right: -40 }]}>
      <View style={styles.container}>

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
          <LinearGradient colors={['rgba(123,92,245,0.5)', 'rgba(0,212,255,0.4)']} style={styles.avatar}>
            <Text style={styles.avatarText}>{displayName.includes('Person') ? '🔍' : '👤'}</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.nameText} numberOfLines={1}>{displayName}</Text>
            <View style={styles.pillRow}>
              <Text style={styles.countText}>{photos.length} photos</Text>
            </View>
          </View>
        </View>
        
        {/* Actions moved to top */}
        {!isSelectionMode && (
          <View style={styles.topActionsRow}>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => setIsRenameModalOpen(true)}>
              <Svg width="14" height="14" viewBox="0 0 15 15" fill="none">
                <Path d="M10.5 2.5l2 2-8 8H2.5v-2l8-8z" stroke={palette.silver} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </Svg>
              <Text style={styles.ghostText}>Rename</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.ghostBtn} onPress={() => Alert.alert('Coming Soon', 'Merging clusters will be available in V2.')}>
              <Svg width="14" height="14" viewBox="0 0 15 15" fill="none">
                <Circle cx="4" cy="7.5" r="3" stroke={palette.silver} strokeWidth="1.3"/>
                <Circle cx="11" cy="7.5" r="3" stroke={palette.silver} strokeWidth="1.3"/>
                <Path d="M7 7.5h1" stroke={palette.silver} strokeWidth="1.3" strokeLinecap="round"/>
              </Svg>
              <Text style={styles.ghostText}>Merge</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Photo grid */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={palette.violet2} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.grid}>
            {photos.map((p) => {
              const isSelected = selectedPhotoIds.has(p.photo_id);
              return (
                <TouchableOpacity
                  key={p.photo_id}
                  style={[styles.gridCell, isSelected && { borderColor: palette.violet2, borderWidth: 2 }]}
                  onPress={() => handlePhotoPress(p.photo_id)}
                  activeOpacity={0.8}
                >
                  {authToken ? (
                    <Image
                      source={{
                        uri: getPhotoUrl(p.photo_id),
                        headers: getAuthHeaders(),
                      }}
                      style={[styles.image, !isSelected && isSelectionMode && { opacity: 0.5 }]}
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
                        <Svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <Path d="M2 5l2.5 2.5 4-4" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </Svg>
                      </LinearGradient>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
            {photos.length === 0 && (
              <View style={[styles.center, { width: '100%', marginTop: 40 }]}>
                <Text style={{ color: palette.muted, fontFamily: getFont('DMSans', '400') }}>No photos in this cluster.</Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* Floating Action Bar for Selection Mode */}
        {isSelectionMode && (
          <View style={styles.selectionActionBar}>
            <TouchableOpacity 
              style={[styles.actionBtn, selectedPhotoIds.size === 0 && { opacity: 0.5 }]} 
              onPress={handleEject}
              disabled={selectedPhotoIds.size === 0}
            >
              <Text style={styles.actionBtnText}>Remove from Person</Text>
            </TouchableOpacity>
            
            <View style={styles.actionDivider} />
            
            <TouchableOpacity 
              style={[styles.actionBtn, selectedPhotoIds.size === 0 && { opacity: 0.5 }]} 
              onPress={handleDelete}
              disabled={selectedPhotoIds.size === 0}
            >
              <Text style={[styles.actionBtnText, { color: '#FF453A' }]}>Delete completely</Text>
            </TouchableOpacity>
          </View>
        )}

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

        {/* Full-screen photo preview modal */}
        <Modal visible={!!previewUri} transparent animationType="fade">
          <View style={styles.previewOverlay}>
            <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewUri(null)}>
              <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <Path d="M18 6L6 18M6 6l12 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </Svg>
            </TouchableOpacity>
            {previewUri && authToken && (
              <Image 
                source={{ 
                  uri: previewUri, 
                  headers: getAuthHeaders() 
                }} 
                style={styles.previewImage} 
                resizeMode="contain" 
              />
            )}
          </View>
        </Modal>

      </View>
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
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
  gridCell: { width: CELL_SIZE, height: CELL_SIZE, borderRadius: 10, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  checkBoxOn: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },

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
  previewImage: { width: '100%', height: '100%' }
});
