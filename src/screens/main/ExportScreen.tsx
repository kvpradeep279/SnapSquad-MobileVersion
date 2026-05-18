import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image,
  ActivityIndicator, Alert, Dimensions
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';

import AnimatedBackground from '../../components/AnimatedBackground';
import GlassCard from '../../components/GlassCard';
import MockupBottomTabs from '../../components/MockupBottomTabs';
import FaceAvatar from '../../components/FaceAvatar';
import { getClusters, getClusterPhotos, ClusterInfo } from '../../services/clusters';
import { useAlbums } from '../../context/AlbumContext';
import { palette, getFont } from '../../theme';
import { RootStackParamList } from '../../types';
import api, { BASE_URL } from '../../services/api';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Export'>;
type RoutePropType = RouteProp<RootStackParamList, 'Export'>;

const SCREEN_WIDTH = Dimensions.get('window').width;
const CELL_SIZE = (SCREEN_WIDTH - 40 - 10) / 3;

const GRAD_COLORS = [
  ['rgba(123,92,245,0.4)', 'rgba(0,212,255,0.3)'],
  ['rgba(0,212,255,0.3)', 'rgba(77,235,160,0.2)'],
  ['rgba(255,208,96,0.2)', 'rgba(123,92,245,0.2)'],
  ['rgba(77,235,160,0.2)', 'rgba(0,212,255,0.3)'],
] as [string, string][];

export default function ExportScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { albums } = useAlbums();
  const completedAlbums = albums.filter(a => a.status === 'complete');

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Album
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(route.params?.albumId || null);

  // Step 2: Clusters
  const [clusters, setClusters] = useState<ClusterInfo[]>([]);
  const [selectedClusterLabels, setSelectedClusterLabels] = useState<Set<number>>(new Set());
  const [loadingClusters, setLoadingClusters] = useState(false);

  // Step 3: Photos
  const [photos, setPhotos] = useState<any[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Download
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ done: 0, total: 0 });

  // Handle passed albumId
  useEffect(() => {
    if (selectedAlbumId) {
      setStep(2);
      loadClusters(selectedAlbumId);
    } else {
      setStep(1);
    }
  }, [selectedAlbumId]);

  // Fetch token for images
  useEffect(() => {
    SecureStore.getItemAsync('auth_token').then(setAuthToken);
  }, []);

  const loadClusters = async (albumId: string) => {
    setLoadingClusters(true);
    try {
      const res = await getClusters(albumId);
      setClusters(res.clusters);
      // Select all by default
      setSelectedClusterLabels(new Set(res.clusters.map(c => c.cluster_label)));
    } catch (e) {
      console.error('Failed to load clusters for export', e);
    } finally {
      setLoadingClusters(false);
    }
  };

  const loadPhotos = async () => {
    if (!selectedAlbumId || selectedClusterLabels.size === 0) return;
    setLoadingPhotos(true);
    setStep(3);

    try {
      let allPhotos: any[] = [];
      for (const label of Array.from(selectedClusterLabels)) {
        const res = await getClusterPhotos(selectedAlbumId, label);
        allPhotos = [...allPhotos, ...res.photo_urls];
      }
      
      // Deduplicate photos (in case a photo has multiple recognized faces from different clusters)
      const uniquePhotos = Array.from(new Map(allPhotos.map(p => [p.photo_id, p])).values());
      
      setPhotos(uniquePhotos);
      // Select all by default
      setSelectedPhotoIds(new Set(uniquePhotos.map(p => p.photo_id)));
    } catch (e) {
      console.error('Failed to load photos for export', e);
    } finally {
      setLoadingPhotos(false);
    }
  };

  const toggleCluster = (label: number) => {
    setSelectedClusterLabels(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const togglePhoto = (photoId: string) => {
    setSelectedPhotoIds(prev => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  const toggleAllPhotos = () => {
    if (selectedPhotoIds.size === photos.length) {
      setSelectedPhotoIds(new Set());
    } else {
      setSelectedPhotoIds(new Set(photos.map(p => p.photo_id)));
    }
  };

  const handleDownload = async () => {
    if (selectedPhotoIds.size === 0) {
      Alert.alert('Nothing selected', 'Please select at least one photo to export.');
      return;
    }
    if (!selectedAlbumId) return;

    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow media library access to save photos.');
      return;
    }

    setDownloading(true);
    const token = await SecureStore.getItemAsync('auth_token');

    let total = selectedPhotoIds.size;
    let done = 0;
    setDownloadProgress({ done: 0, total });

    let successCount = 0;
    let failCount = 0;

    for (const photoId of Array.from(selectedPhotoIds)) {
      try {
        const url = `${BASE_URL}/albums/${selectedAlbumId}/photos/${photoId}/raw`;
        const tempPath = `${FileSystem.cacheDirectory}export_${photoId}.jpg`;

        const result = await FileSystem.downloadAsync(url, tempPath, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (result.status === 200) {
          const asset = await MediaLibrary.createAssetAsync(result.uri);
          const album = await MediaLibrary.getAlbumAsync('SnapSquad');
          if (album === null) {
            await MediaLibrary.createAlbumAsync('SnapSquad', asset, false);
          } else {
            await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
          }
          successCount++;
        } else {
          failCount++;
        }
      } catch (e) {
        failCount++;
        console.error(`Failed to download photo ${photoId}`, e);
      } finally {
        done++;
        setDownloadProgress({ done, total });
      }
    }

    setDownloading(false);

    if (failCount === 0) {
      Alert.alert('Export complete ✅', `${successCount} photos saved to your gallery.`, [
        { text: 'OK', onPress: () => navigation.navigate('Home' as any) }
      ]);
    } else {
      Alert.alert('Export done with issues', `${successCount} saved, ${failCount} failed.`);
    }
  };

  const handleBack = () => {
    if (step === 3) {
      setStep(2);
    } else if (step === 2) {
      // If we came from another screen with an albumId, going back should go to Home
      if (route.params?.albumId) {
        navigation.navigate('Home' as any);
      } else {
        setStep(1);
        setSelectedAlbumId(null);
      }
    } else {
      navigation.navigate('Home' as any);
    }
  };

  const renderStep1 = () => (
    <View style={{ flex: 1 }}>
      <Text style={styles.listLabel}>Step 1: Select an album to export from</Text>
      {completedAlbums.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No completed albums found.{'\n'}Process an album first.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
          {completedAlbums.map((album) => (
            <TouchableOpacity key={album.album_id} onPress={() => setSelectedAlbumId(album.album_id)}>
              <GlassCard style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontFamily: getFont('Syne', '700'), fontSize: 15, color: palette.silver2, marginBottom: 4 }}>
                    {album.name}
                  </Text>
                  <Text style={{ fontFamily: getFont('DMSans', '400'), fontSize: 11, color: palette.muted }}>
                    {album.total_photos} photos · {album.total_faces} faces
                  </Text>
                </View>
                <Svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <Path d="M6 4l4 4-4 4" stroke={palette.silver} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </Svg>
              </GlassCard>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );

  const renderStep2 = () => {
    if (loadingClusters) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.violet2} />
        </View>
      );
    }

    if (clusters.length === 0) {
      return (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No clusters found in this album.</Text>
        </View>
      );
    }

    return (
      <View style={{ flex: 1 }}>
        <Text style={styles.listLabel}>
          Step 2: Select clusters · {selectedClusterLabels.size}/{clusters.length} selected
        </Text>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
          {clusters.map((cluster, i) => {
            const isSelected = selectedClusterLabels.has(cluster.cluster_label);
            const grad = GRAD_COLORS[i % GRAD_COLORS.length];
            return (
              <TouchableOpacity key={cluster.cluster_label} onPress={() => toggleCluster(cluster.cluster_label)}>
                <GlassCard style={[styles.listItem, isSelected && { borderColor: 'rgba(123,92,245,0.35)' }]}>
                  {cluster.representative_face && selectedAlbumId ? (
                    <View style={[styles.listAvatar, { overflow: 'hidden' }]}>
                      <FaceAvatar
                        albumId={selectedAlbumId}
                        photoId={cluster.representative_face.photo_id}
                        bbox={cluster.representative_face.bbox}
                        size={38}
                      />
                    </View>
                  ) : (
                    <LinearGradient colors={isSelected ? grad : ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.02)']} style={styles.listAvatar}>
                      <Text style={styles.avatarText}>{cluster.display_name.includes('Person') ? '🔍' : '👤'}</Text>
                    </LinearGradient>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.listName, { color: isSelected ? palette.silver2 : palette.muted }]}>
                      {cluster.display_name}
                    </Text>
                    <Text style={styles.listSub}>{cluster.face_count} photos</Text>
                  </View>
                  {isSelected ? (
                    <LinearGradient colors={palette.gradient.hero} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.checkBoxOn}>
                      <Svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <Path d="M2 5l2.5 2.5 4-4" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </Svg>
                    </LinearGradient>
                  ) : (
                    <View style={styles.checkBoxOff} />
                  )}
                </GlassCard>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TouchableOpacity style={[styles.mainBtn, selectedClusterLabels.size === 0 && { opacity: 0.5 }]} onPress={loadPhotos} disabled={selectedClusterLabels.size === 0}>
          <LinearGradient colors={palette.gradient.hero} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.mainBtnGrad}>
            <Text style={styles.mainBtnText}>Next: Select Photos</Text>
            <Svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <Path d="M6 4l4 4-4 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </Svg>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  };

  const renderStep3 = () => {
    if (loadingPhotos) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.violet2} />
          <Text style={{ color: palette.muted, marginTop: 12 }}>Loading photos...</Text>
        </View>
      );
    }

    if (photos.length === 0) {
      return (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No photos found in selected clusters.</Text>
        </View>
      );
    }

    return (
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={styles.listLabel}>Step 3: Select photos to download</Text>
          <TouchableOpacity onPress={toggleAllPhotos}>
            <Text style={{ color: palette.violet2, fontSize: 12, fontFamily: getFont('Syne', '700') }}>
              {selectedPhotoIds.size === photos.length ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.grid}>
          {photos.map(p => {
            const isSelected = selectedPhotoIds.has(p.photo_id);
            return (
              <TouchableOpacity
                key={p.photo_id}
                style={[styles.gridCell, isSelected && { borderColor: palette.violet2, borderWidth: 2 }]}
                onPress={() => togglePhoto(p.photo_id)}
                activeOpacity={0.8}
              >
                {authToken ? (
                  <Image
                    source={{
                      uri: `${BASE_URL}/albums/${selectedAlbumId}/photos/${p.photo_id}/raw`,
                      headers: { Authorization: `Bearer ${authToken}` },
                    }}
                    style={[styles.image, !isSelected && { opacity: 0.5 }]}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.image, { backgroundColor: palette.glass2, alignItems: 'center', justifyContent: 'center' }]}>
                    <ActivityIndicator size="small" color={palette.violet2} />
                  </View>
                )}
                {isSelected && (
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
        </ScrollView>

        {downloading && (
          <View style={styles.progressWrap}>
            <View style={styles.progressBarBg}>
              <LinearGradient
                colors={palette.gradient.hero}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[styles.progressBarFill, {
                  width: downloadProgress.total > 0
                    ? `${Math.round((downloadProgress.done / downloadProgress.total) * 100)}%`
                    : '0%'
                }]}
              />
            </View>
            <Text style={styles.progressText}>
              Saving {downloadProgress.done} / {downloadProgress.total} photos…
            </Text>
          </View>
        )}

        <TouchableOpacity style={[styles.mainBtn, selectedPhotoIds.size === 0 && { opacity: 0.5 }]} onPress={handleDownload} disabled={downloading || selectedPhotoIds.size === 0}>
          <LinearGradient colors={downloading ? ['rgba(123,92,245,0.3)', 'rgba(0,212,255,0.2)'] : palette.gradient.hero} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.mainBtnGrad}>
            {downloading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <Path d="M8 2v8M4 10l4 4 4-4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </Svg>
                <Text style={styles.mainBtnText}>
                  Download {selectedPhotoIds.size} {selectedPhotoIds.size === 1 ? 'photo' : 'photos'}
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <AnimatedBackground>
      <View style={{ flex: 1 }}>
        <View style={styles.content}>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
              <Svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <Path d="M10 3L5 8l5 5" stroke={palette.silver} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </Svg>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Export</Text>
          </View>

          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          
        </View>
        <MockupBottomTabs activeTab="export" />
      </View>
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: palette.muted, fontFamily: getFont('DMSans', '400'), fontSize: 13, textAlign: 'center', lineHeight: 20 },

  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  backBtn: { width: 36, height: 36, backgroundColor: palette.glass2, borderWidth: 1, borderColor: palette.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: getFont('Syne', '800'), fontSize: 16, color: palette.silver2 },

  listLabel: { fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400'), marginBottom: 8 },
  listItem: { paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  listAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16 },
  listName: { fontFamily: getFont('Syne', '700'), fontSize: 13 },
  listSub: { fontSize: 10, color: palette.muted, fontFamily: getFont('DMSans', '400'), marginTop: 2 },
  checkBoxOn: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  checkBoxOff: { width: 22, height: 22, borderRadius: 7, backgroundColor: palette.glass2, borderWidth: 1, borderColor: palette.border },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, paddingBottom: 20 },
  gridCell: { width: CELL_SIZE, height: CELL_SIZE, borderRadius: 10, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },

  progressWrap: { marginBottom: 10 },
  progressBarBg: { height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
  progressBarFill: { height: '100%', borderRadius: 2 },
  progressText: { fontSize: 10, color: palette.muted, fontFamily: getFont('DMSans', '400') },

  mainBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 8 },
  mainBtnGrad: { paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  mainBtnText: { color: '#fff', fontFamily: getFont('Syne', '700'), fontSize: 15, letterSpacing: 0.3 },
});
