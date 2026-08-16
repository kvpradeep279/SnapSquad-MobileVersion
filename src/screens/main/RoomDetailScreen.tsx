import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Image, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Feather, Ionicons } from '@expo/vector-icons';

import AnimatedBackground from '../../components/AnimatedBackground';
import GlassCard from '../../components/GlassCard';
import EmptyState from '../../components/EmptyState';
import { palette, getFont } from '../../theme';
import { RootStackParamList } from '../../types';
import ConfirmModal from '../../components/ConfirmModal';
import { listRoomPhotos, getRoomClusters, listMembers, getRoomStatus, RoomPhoto, RoomCluster, RoomMember, RoomStatus, triggerRoomProcessing, setMemberRole, deleteRoomPhoto, deleteRoomCluster, deleteRoom, leaveRoom, removeMember } from '../../services/rooms';
import api from '../../services/api';
import AuthImage from '../../components/AuthImage';
import * as SecureStore from 'expo-secure-store';
import { getFirebaseIdToken } from '../../services/auth';
import FaceAvatar from '../../components/FaceAvatar';
import ImageViewerModal from '../../components/ImageViewerModal';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'RoomDetail'>;

type TabKey = 'photos' | 'timeline' | 'clusters' | 'members';

export default function RoomDetailScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const { roomId, roomName } = route.params;

  const [activeTab, setActiveTab] = useState<TabKey>('photos');
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

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);
  const [viewerImages, setViewerImages] = useState<string[]>([]);

  const closeConfirm = () => setConfirmModal(prev => ({ ...prev, visible: false }));
  const [loading, setLoading] = useState(true);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ done: 0, total: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [photos, setPhotos] = useState<RoomPhoto[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [clusters, setClusters] = useState<RoomCluster[]>([]);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [status, setStatus] = useState<RoomStatus | null>(null);

  const toggleSelectionMode = () => {
    if (isSelectionMode) {
      setIsSelectionMode(false);
      setSelectedPhotos(new Set());
    } else {
      setIsSelectionMode(true);
    }
  };

  const toggleSelection = (photoId: string) => {
    setSelectedPhotos(prev => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedPhotos.size === 0) return;
    setConfirmModal({
      visible: true,
      title: 'Delete Photos',
      message: `Are you sure you want to delete ${selectedPhotos.size} photo(s)?`,
      confirmText: 'Delete',
      isDestructive: true,
      onConfirm: async () => {
        closeConfirm();
        setLoading(true);
        let errorCount = 0;
        for (const pid of Array.from(selectedPhotos)) {
          try {
            await deleteRoomPhoto(roomId, pid);
          } catch (e) {
            errorCount++;
          }
        }
        if (errorCount > 0) {
          alert(`Failed to delete ${errorCount} photos`);
        }
        setSelectedPhotos(new Set());
        setIsSelectionMode(false);
        loadData(true);
      }
    });
  };

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [pRes, cRes, mRes, sRes] = await Promise.all([
        listRoomPhotos(roomId),
        getRoomClusters(roomId),
        listMembers(roomId),
        getRoomStatus(roomId),
      ]);
      setPhotos(pRes);
      setClusters(cRes);
      setMembers(mRes);
      setStatus(sRes);
    } catch (err) {
      console.log('Failed to load room details', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [roomId]);

  useEffect(() => {
    getFirebaseIdToken().then(setAuthToken);
    loadData();
  }, [loadData]);

  useEffect(() => {
    const isClustering = status?.status === 'clustering';
    const pollInterval = isClustering ? 3000 : 15000;
    
    const interval = setInterval(() => {
      loadData(true);
    }, pollInterval);
    
    return () => clearInterval(interval);
  }, [loadData, status?.status]);

  const getBannerText = () => {
    if (!status?.jobs || status.jobs.length === 0) return 'Processing new photos...';
    const latestJob = status.jobs[0];
    
    switch (latestJob.stage) {
      case 'queued': return 'In queue (waiting for resources)...';
      case 'loading_embeddings': return 'Loading face embeddings...';
      case 'clustering': return 'Clustering faces (AI running)...';
      case 'saving_results': return 'Saving results...';
      default: return 'Processing new photos...';
    }
  };

  const handleUpload = () => {
    navigation.navigate('Upload', { roomId });
  };

  const handleProcess = async () => {
    try {
      await triggerRoomProcessing(roomId);
      loadData(true);
    } catch (err) {
      console.log('Failed to trigger processing');
    }
  };

  const handleFindMe = () => {
    if (status?.photo_count === 0) {
      setConfirmModal({
        visible: true,
        title: 'No Photos Yet',
        message: 'No photos have been uploaded to this event yet. Kindly try again later.',
        confirmText: 'OK',
        hideCancel: true,
        onConfirm: closeConfirm
      });
      return;
    }
    navigation.navigate('FindMe', { roomId, roomName });
  };

  const handleRoomDelete = () => {
    setConfirmModal({
      visible: true,
      title: 'Delete Room',
      message: `Are you sure you want to completely delete "${roomName}"? This will delete all photos and kick all members.`,
      confirmText: 'Delete',
      isDestructive: true,
      onConfirm: async () => {
        closeConfirm();
        setLoading(true);
        try {
          await deleteRoom(roomId);
          navigation.goBack();
        } catch (e) {
          setTimeout(() => {
            setConfirmModal({ visible: true, title: 'Error', message: 'Failed to delete room', confirmText: 'OK', hideCancel: true, onConfirm: closeConfirm });
          }, 500);
          setLoading(false);
        }
      }
    });
  };

  const handleLeaveRoom = () => {
    setConfirmModal({
      visible: true,
      title: 'Leave Room',
      message: `Are you sure you want to leave "${roomName}"?`,
      confirmText: 'Leave',
      isDestructive: true,
      onConfirm: async () => {
        closeConfirm();
        setLoading(true);
        try {
          await leaveRoom(roomId);
          navigation.goBack();
        } catch (e) {
          setTimeout(() => {
            setConfirmModal({ visible: true, title: 'Error', message: 'Failed to leave room', confirmText: 'OK', hideCancel: true, onConfirm: closeConfirm });
          }, 500);
          setLoading(false);
        }
      }
    });
  };

  const handleDeletePhoto = (photo: RoomPhoto) => {
    if (status?.my_role !== 'creator' && photo.uploader_id !== status?.my_user_id) return;
    setConfirmModal({
      visible: true,
      title: 'Delete Photo',
      message: 'Are you sure you want to delete this photo?',
      confirmText: 'Delete',
      isDestructive: true,
      onConfirm: async () => {
        closeConfirm();
        try {
          await deleteRoomPhoto(roomId, photo.id);
          setPhotos(prev => prev.filter(p => p.id !== photo.id));
        } catch (e) {
          setTimeout(() => {
            setConfirmModal({ visible: true, title: 'Error', message: 'Failed to delete photo', confirmText: 'OK', hideCancel: true, onConfirm: closeConfirm });
          }, 500);
        }
      }
    });
  };

  const handleDeleteCluster = (cluster: RoomCluster) => {
    setConfirmModal({
      visible: true,
      title: 'Delete Cluster',
      message: 'Are you sure you want to delete this cluster? Photos will not be deleted, but the grouping will be removed.',
      confirmText: 'Delete',
      isDestructive: true,
      onConfirm: async () => {
        closeConfirm();
        try {
          await deleteRoomCluster(roomId, cluster.cluster_label);
          setClusters(prev => prev.filter(c => c.cluster_label !== cluster.cluster_label));
        } catch (e) {
          setTimeout(() => {
            setConfirmModal({ visible: true, title: 'Error', message: 'Failed to delete cluster', confirmText: 'OK', hideCancel: true, onConfirm: closeConfirm });
          }, 500);
        }
      }
    });
  };

  const handleRemoveMember = (member: RoomMember) => {
    setConfirmModal({
      visible: true,
      title: 'Remove Member',
      message: `Are you sure you want to remove ${member.display_name} from the room? This will also delete all photos they uploaded.`,
      confirmText: 'Remove',
      isDestructive: true,
      onConfirm: async () => {
        closeConfirm();
        setLoading(true);
        try {
          await removeMember(roomId, member.user_id);
          // Reload data to reflect removed member and deleted photos/clusters
          loadData(true);
        } catch (e) {
          setTimeout(() => {
            setConfirmModal({ visible: true, title: 'Error', message: 'Failed to remove member', confirmText: 'OK', hideCancel: true, onConfirm: closeConfirm });
          }, 500);
          setLoading(false);
        }
      }
    });
  };

  const handleDownloadAll = async () => {
    if (photos.length === 0) return;
    setDownloading(true);
    setDownloadProgress({ done: 0, total: photos.length });
    
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

    for (const p of photos) {
      try {
        const url = getPhotoUrl(p.id);
        const tempPath = `${FileSystem.cacheDirectory}export_${p.id}.jpg`;
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
        setDownloadProgress({ done, total: photos.length });
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

  const getPhotoUrl = (photoId: string) => {
    return `${api.defaults.baseURL}/rooms/${roomId}/photos/${photoId}/raw`;
  };

  const renderPhotos = () => {
    if (photos.length === 0) {
      return <EmptyState iconType="album" title="No photos yet" subtitle="Be the first to upload photos to this room." />;
    }
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.grid}>
        {photos.map((p, index) => {
          const isSelected = selectedPhotos.has(p.id);
          return (
          <View key={p.id} style={[styles.gridItemWrap, isSelected && { borderColor: palette.violet2, borderWidth: 2 }]}>
            <TouchableOpacity 
              style={{ flex: 1 }}
              activeOpacity={0.8}
              onPress={() => {
                if (isSelectionMode) {
                  toggleSelection(p.id);
                } else {
                  setViewerImages(photos.map(photo => getPhotoUrl(photo.id)));
                  setViewerInitialIndex(index);
                  setViewerVisible(true);
                }
              }}
              onLongPress={() => {
                if (!isSelectionMode && (status?.my_role === 'creator' || status?.my_role === 'uploader')) {
                  setIsSelectionMode(true);
                  toggleSelection(p.id);
                }
              }}
            >
              <AuthImage
                url={getPhotoUrl(p.id)}
                style={styles.gridImage}
                resizeMode="cover"
              />
              {status?.my_role !== 'uploader' && (
                <View style={styles.uploaderBadge}>
                  <Text style={styles.uploaderText}>@{p.uploader_name}</Text>
                </View>
              )}
            </TouchableOpacity>

            {(status?.my_role === 'creator' || status?.my_role === 'uploader') && isSelected && isSelectionMode && (
              <View style={{ position: 'absolute', top: 6, right: 6 }}>
                <LinearGradient colors={palette.gradient.hero} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.checkBoxOn}>
                  <Svg width="14" height="14" viewBox="0 0 10 10" fill="none">
                    <Path d="M2 5l2.5 2.5 4-4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </Svg>
                </LinearGradient>
              </View>
            )}
          </View>
        )})}
        </View>
      </View>
    );
  };

  const renderTimeline = () => {
    if (photos.length === 0) {
      return <EmptyState iconType="album" title="No photos yet" subtitle="Upload photos to start your timeline." />;
    }

    // Group photos by date
    const grouped: Record<string, RoomPhoto[]> = {};
    photos.forEach(p => {
      const dateStr = new Date(p.created_at).toLocaleDateString(undefined, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
      if (!grouped[dateStr]) grouped[dateStr] = [];
      grouped[dateStr].push(p);
    });

    const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    return (
      <View style={styles.timelineList}>
        {sortedDates.map(dateLabel => (
          <View key={dateLabel} style={styles.timelineGroup}>
            <Text style={styles.timelineDate}>{dateLabel}</Text>
            {grouped[dateLabel].map((p, index) => (
              <TouchableOpacity 
                key={p.id} 
                style={styles.timelinePhotoWrap}
                activeOpacity={0.9}
                onPress={() => {
                  setViewerImages(grouped[dateLabel].map(photo => getPhotoUrl(photo.id)));
                  setViewerInitialIndex(index);
                  setViewerVisible(true);
                }}
              >
                <AuthImage
                  url={getPhotoUrl(p.id)}
                  style={styles.timelineImage}
                  resizeMode="cover"
                />
                <View style={styles.timelineOverlay}>
                  <Text style={styles.timelineTime}>
                    {new Date(p.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text style={styles.timelineUploader}>by @{p.uploader_name}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    );
  };

  const renderClusters = () => {
    if (clusters.length === 0) {
      return <EmptyState iconType="cluster" title="No people found" subtitle="Upload photos to identify people in this room." />;
    }

    const GRAD_COLORS = [
      ['rgba(123,92,245,0.4)', 'rgba(0,212,255,0.3)'],
      ['rgba(0,212,255,0.3)',  'rgba(77,235,160,0.2)'],
      ['rgba(255,208,96,0.2)', 'rgba(123,92,245,0.2)'],
      ['rgba(77,235,160,0.2)', 'rgba(0,212,255,0.3)'],
    ];

    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' }}>
        {clusters.map((c, i) => {
          const grad = GRAD_COLORS[i % GRAD_COLORS.length] as [string, string];
          const isUnidentified = c.cluster_label === -1;
          
          return (
            <TouchableOpacity
              key={c.id}
              style={{ width: '48.5%', marginBottom: 12 }}
              onPress={() => {
                if (status?.album_id) {
                  navigation.navigate('ClusterDetail', { 
                    albumId: status.album_id, 
                    clusterLabel: c.cluster_label, 
                    displayName: isUnidentified ? 'Unidentified' : (c.display_name || `Person ${c.cluster_label}`) 
                  });
                }
              }}
            >
              <View style={[styles.polaroidCard, isUnidentified && { borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 }]}>
                <View style={styles.polaroidImageContainer}>
                  {c.representative_face ? (
                    <FaceAvatar
                      albumId={status?.album_id || ''}
                      photoId={c.representative_face.photo_id}
                      bbox={c.representative_face.bbox}
                      size={250} // Make large enough to fill container
                      borderRadius={0}
                    />
                  ) : (
                    <LinearGradient colors={isUnidentified ? ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)'] : grad} style={StyleSheet.absoluteFill}>
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        {isUnidentified ? (
                          <Feather name="help-circle" size={30} color="rgba(200,208,224,0.3)" />
                        ) : (
                          <Text style={{ fontSize: 32 }}>{c.display_name?.includes('Person') ? '🔍' : '👤'}</Text>
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
                    {isUnidentified ? 'Unidentified' : (c.display_name || `Person ${c.cluster_label}`)}
                  </Text>
                  <Text style={styles.polaroidSub}>
                    {c.face_count} {isUnidentified ? 'faces' : 'photos'}
                  </Text>
                </LinearGradient>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const handleChangeRole = async (targetUserId: string, currentRole: string) => {
    const newRole = currentRole === 'uploader' ? 'viewer' : 'uploader';
    console.log(`[RoomDetail] Changing role: room=${roomId}, user=${targetUserId}, from=${currentRole}, to=${newRole}`);
    try {
      const result = await setMemberRole(roomId, targetUserId, newRole as 'viewer' | 'uploader');
      console.log('[RoomDetail] Role changed:', result);
      loadData(true); // Refresh
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Unknown error';
      console.error('[RoomDetail] Role change failed:', detail, '| status:', err?.response?.status);
    }
  };

  const renderMembers = () => {
    return (
      <View style={styles.list}>
        {status?.my_role === 'creator' && (
          <TouchableOpacity 
            style={styles.manageRequestsBtn}
            onPress={() => navigation.navigate('PendingRequests', { roomId, roomName })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Feather name="user-plus" size={16} color={palette.violet2} style={{ marginRight: 8 }} />
              <Text style={styles.manageRequestsBtnText}>Manage Join Requests</Text>
            </View>
            <Feather name="chevron-right" size={16} color={palette.violet2} />
          </TouchableOpacity>
        )}
        
        {members.map(m => (
          <GlassCard key={m.user_id} style={styles.listItem}>
            <LinearGradient colors={palette.gradient.hero} style={styles.avatar}>
              <Text style={styles.avatarText}>{(m.display_name?.[0] || '?').toUpperCase()}</Text>
            </LinearGradient>
            <View style={styles.listItemInfo}>
              <Text style={styles.listItemTitle}>{m.display_name}</Text>
              <Text style={styles.listItemDesc}>
                {m.role === 'creator' ? 'Creator' : (m.role === 'uploader' ? 'Uploader' : (m.role === 'viewer' ? 'Viewer' : 'Attendee'))}
              </Text>
            </View>
            {/* Creator can toggle member roles in EVENT rooms and remove members */}
            {status?.my_role === 'creator' && m.role !== 'creator' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {status?.room_type === 'event' && (
                  <TouchableOpacity
                    style={[styles.roleToggleBtn, m.role === 'uploader' && styles.roleToggleBtnActive]}
                    onPress={() => handleChangeRole(m.user_id, m.role)}
                  >
                    <Feather 
                      name={m.role === 'uploader' ? 'upload' : 'eye'} 
                      size={13} 
                      color={m.role === 'uploader' ? palette.violet2 : palette.silver2} 
                    />
                    <Text style={[styles.roleToggleBtnText, m.role === 'uploader' && { color: palette.violet2 }]}>
                      {m.role === 'uploader' ? 'Uploader' : 'Viewer'}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={{
                    width: 32, height: 32, borderRadius: 16,
                    backgroundColor: 'rgba(255, 68, 68, 0.1)',
                    justifyContent: 'center', alignItems: 'center'
                  }}
                  onPress={() => handleRemoveMember(m)}
                >
                  <Feather name="trash-2" size={14} color={palette.red} />
                </TouchableOpacity>
              </View>
            )}
          </GlassCard>
        ))}
      </View>
    );
  };

  return (
    <AnimatedBackground>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Feather name="chevron-left" size={20} color={palette.silver} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>{isSelectionMode ? `${selectedPhotos.size} Selected` : roomName}</Text>
            {!isSelectionMode && status && (
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>
                  {status.my_role === 'creator' ? 'Creator' : (status.room_type === 'shared' ? 'Attendee' : (status.my_role === 'uploader' ? 'Uploader' : 'Viewer'))}
                </Text>
              </View>
            )}
            {!isSelectionMode && (
              <Text style={styles.headerSub}>{photos.length} photos • {members.length} members</Text>
            )}
          </View>
          
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            {activeTab === 'photos' && photos.length > 0 && (status?.my_role === 'creator' || status?.my_role === 'uploader') && (
              <TouchableOpacity onPress={toggleSelectionMode} style={styles.selectBtn}>
                <Text style={styles.selectBtnText}>{isSelectionMode ? 'Cancel' : 'Select'}</Text>
              </TouchableOpacity>
            )}

            {!isSelectionMode && status?.my_role === 'creator' && (
              <TouchableOpacity style={styles.qrBtn} onPress={handleRoomDelete}>
                <Feather name="trash-2" size={20} color={palette.red} />
              </TouchableOpacity>
            )}

            {!isSelectionMode && status && status.my_role !== 'creator' && (
              <TouchableOpacity style={styles.qrBtn} onPress={handleLeaveRoom}>
                <Feather name="log-out" size={18} color={palette.red} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Dynamic View based on Role and Room Mode */}
        {status?.room_type === 'event' && status?.my_role === 'viewer' ? (
          /* EVENT VIEWER VIEW */
          <View style={styles.attendeeView}>
            <View style={styles.attendeeHero}>
              <View style={[styles.clusterIconBox, { width: 64, height: 64, marginBottom: 16, borderRadius: 20 }]}>
                <Text style={[styles.clusterIconText, { fontSize: 32 }]}>✨</Text>
              </View>
              <Text style={styles.attendeeTitle}>You're In!</Text>
              <Text style={styles.attendeeSub}>
                When photos of you are uploaded by the event creators, they will instantly appear here.
              </Text>
            </View>
            <View style={styles.findMeBtnHuge}>
              <TouchableOpacity activeOpacity={0.8} onPress={handleFindMe}>
                <LinearGradient colors={['rgba(123,92,245,0.8)', 'rgba(0,212,255,0.8)']} start={{x:0, y:0}} end={{x:1, y:1}} style={styles.findMeBtnHugeGrad}>
                  <Feather name="search" size={20} color={palette.white} style={{ marginRight: 8 }} />
                  <Text style={styles.findMeBtnHugeText}>Find Me Now</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {/* Action Bar */}
            {!isSelectionMode && (
              <View style={styles.actionBar}>
              <TouchableOpacity style={styles.actionBtn} onPress={handleUpload}>
                <Feather name="upload" size={18} color={palette.white} />
                <Text style={styles.actionBtnText}>Upload</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.actionBtn} onPress={handleFindMe}>
                <Feather name="search" size={18} color={palette.white} />
                <Text style={styles.actionBtnText}>Find Me</Text>
              </TouchableOpacity>

              {status?.my_role !== 'uploader' && (
                <TouchableOpacity style={styles.actionBtn} onPress={handleDownloadAll} disabled={downloading}>
                  <Feather name="download" size={18} color={palette.white} />
                  <Text style={styles.actionBtnText}>
                    {downloading ? `Saving` : 'Export'}
                  </Text>
                </TouchableOpacity>
              )}

              {status?.my_role === 'creator' && (
                <TouchableOpacity 
                  style={[styles.actionBtn, { backgroundColor: palette.violet2, borderColor: palette.violet }]} 
                  onPress={() => navigation.navigate('RoomQR', { 
                    roomId, 
                    roomName, 
                    qrPayload: JSON.stringify({ room_id: roomId, room_name: roomName }) 
                  })}
                >
                  <Ionicons name="qr-code" size={18} color={palette.white} />
                  <Text style={styles.actionBtnText}>Show QR</Text>
                </TouchableOpacity>
              )}
            </View>
            )}

            {status && status.status === 'clustering' && (
              <View style={styles.processingBanner}>
                <ActivityIndicator size="small" color={palette.amber} />
                <Text style={styles.processingText}>{getBannerText()}</Text>
              </View>
            )}

            {/* Tabs (Hidden for Uploaders) */}
            {status?.my_role !== 'uploader' && (
              <View style={styles.tabsRow}>
                {(['photos', 'timeline', 'clusters', 'members'] as TabKey[]).map(tab => (
                  <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
                    <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Content */}
            <ScrollView
              style={styles.content}
              contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={palette.violet2} />}
            >
              {loading ? (
                <ActivityIndicator size="large" color={palette.violet2} style={{ marginTop: 40 }} />
              ) : (
                activeTab === 'photos' ? renderPhotos() :
                activeTab === 'timeline' ? renderTimeline() :
                activeTab === 'clusters' ? renderClusters() :
                renderMembers()
              )}
            </ScrollView>
          </>
        )}
        {isSelectionMode && (
          <View style={styles.selectionActionBar}>
            <TouchableOpacity 
              style={[styles.selectionActionBtn, selectedPhotos.size === 0 && { opacity: 0.5 }]} 
              onPress={handleDeleteSelected}
              disabled={selectedPhotos.size === 0}
            >
              <Text style={[styles.selectionActionBtnText, { color: palette.red }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
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
      
      <ImageViewerModal
        visible={viewerVisible}
        images={viewerImages}
        initialIndex={viewerInitialIndex}
        onClose={() => setViewerVisible(false)}
      />
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 },
  backBtn: { width: 36, height: 36, backgroundColor: palette.glass2, borderWidth: 1, borderColor: palette.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  headerTitleWrap: { flex: 1 },
  headerTitle: { fontFamily: getFont('Syne', '800'), fontSize: 20, color: palette.white },
  headerSub: { color: palette.muted, fontSize: 12, fontFamily: getFont('DMSans', '400') },
  qrBtn: { width: 40, height: 40, backgroundColor: 'rgba(123,92,245,0.15)', borderWidth: 1, borderColor: 'rgba(123,92,245,0.3)', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  roleBadge: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginTop: 4, alignSelf: 'flex-start' },
  roleBadgeText: { color: palette.silver, fontSize: 10, fontFamily: getFont('Syne', '700'), textTransform: 'uppercase' },

  actionBar: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 16 },
  
  actionBtn: { flex: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.border, paddingVertical: 14, alignItems: 'center', flexDirection: 'column', justifyContent: 'center', gap: 4 },
  actionBtnText: { color: palette.white, fontFamily: getFont('Syne', '700'), fontSize: 11, textAlign: 'center' },

  selectionActionBar: { position: 'absolute', bottom: 30, left: 20, right: 20, flexDirection: 'row', backgroundColor: 'rgba(25,25,35,0.95)', borderRadius: 16, borderWidth: 1, borderColor: palette.border, overflow: 'hidden', zIndex: 20 },
  selectionActionBtn: { flex: 1, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  selectionActionBtnText: { fontFamily: getFont('Syne', '700'), fontSize: 14 },

  selectBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: palette.glass2, borderRadius: 12, borderWidth: 1, borderColor: palette.border },
  selectBtnText: { color: palette.violet2, fontFamily: getFont('Syne', '700'), fontSize: 13 },

  attendeeView: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, marginTop: 40 },
  attendeeHero: { alignItems: 'center', marginBottom: 32 },
  attendeeTitle: { color: palette.white, fontSize: 24, fontFamily: getFont('Syne', '800'), marginBottom: 8, textAlign: 'center' },
  attendeeSub: { color: palette.silver, fontSize: 14, fontFamily: getFont('DMSans', '400'), textAlign: 'center', lineHeight: 20 },
  findMeBtnHuge: { width: '100%', borderRadius: 16, overflow: 'hidden', backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.border },
  findMeBtnHugeGrad: { paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  findMeBtnHugeText: { color: palette.white, fontSize: 16, fontFamily: getFont('Syne', '700') },

  processingBanner: { backgroundColor: 'rgba(255,180,0,0.15)', marginHorizontal: 20, marginBottom: 16, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: 'rgba(255,180,0,0.3)' },
  processingText: { color: palette.amber, fontSize: 12, fontFamily: getFont('DMSans', '500') },

  tabsRow: { flexDirection: 'row', paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: palette.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: palette.violet2 },
  tabText: { color: palette.muted, fontFamily: getFont('Syne', '600'), fontSize: 14 },
  tabTextActive: { color: palette.white },

  content: { flex: 1 },
  
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  gridItemWrap: { width: '32%', aspectRatio: 1, position: 'relative', borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  gridImage: { flex: 1, borderRadius: 8, backgroundColor: palette.glass },
  uploaderBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  uploaderText: { color: palette.white, fontSize: 10, fontFamily: getFont('Syne', '600') },

  timelineList: { gap: 24, paddingBottom: 20 },
  timelineGroup: { gap: 12 },
  timelineDate: { color: palette.white, fontSize: 16, fontFamily: getFont('Syne', '700'), marginLeft: 4, marginBottom: 4 },
  timelinePhotoWrap: { width: '100%', aspectRatio: 4/5, borderRadius: 16, overflow: 'hidden', position: 'relative' },
  timelineImage: { flex: 1, backgroundColor: palette.glass },
  timelineOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, paddingTop: 40,
    backgroundColor: 'rgba(0,0,0,0.4)',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  timelineTime: { color: palette.white, fontSize: 14, fontFamily: getFont('Syne', '700') },
  timelineUploader: { color: palette.silver, fontSize: 12, fontFamily: getFont('DMSans', '500') },

  list: { gap: 12 },
  listItem: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  clusterIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
  clusterIconText: { fontSize: 20 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: palette.white, fontSize: 18, fontWeight: '700' },
  checkBoxOn: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  listItemInfo: { flex: 1 },
  listItemTitle: { fontFamily: getFont('Syne', '700'), fontSize: 15, color: palette.silver2 },
  listItemDesc: { fontSize: 12, color: palette.muted, fontFamily: getFont('DMSans', '400') },
  
  btnSmall: { backgroundColor: 'rgba(123,92,245,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  btnSmallText: { color: palette.violet2, fontSize: 12, fontFamily: getFont('Syne', '700') },

  manageRequestsBtn: { backgroundColor: 'rgba(123,92,245,0.1)', padding: 16, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, borderWidth: 1, borderColor: 'rgba(123,92,245,0.3)' },
  manageRequestsBtnText: { color: palette.violet2, fontFamily: getFont('Syne', '700'), fontSize: 14 },

  roleToggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.border },
  roleToggleBtnActive: { borderColor: palette.violet2, backgroundColor: 'rgba(123,92,245,0.15)' },
  roleToggleBtnText: { color: palette.silver2, fontSize: 11, fontFamily: getFont('Syne', '700') },

  // Polaroid styles for clusters
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
});
