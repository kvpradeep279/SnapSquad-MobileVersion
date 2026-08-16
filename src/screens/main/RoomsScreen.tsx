import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Alert, Modal, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';

import AnimatedBackground from '../../components/AnimatedBackground';
import GlassCard from '../../components/GlassCard';
import MockupBottomTabs from '../../components/MockupBottomTabs';
import SkeletonLoader from '../../components/SkeletonLoader';
import EmptyState from '../../components/EmptyState';
import { palette, getFont } from '../../theme';
import { RootStackParamList } from '../../types';
import * as SecureStore from 'expo-secure-store';
import { listMyRooms, createRoom, Room, deleteRoom, leaveRoom } from '../../services/rooms';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function RoomsScreen() {
  const navigation = useNavigation<NavProp>();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [roomNameInput, setRoomNameInput] = useState('');
  const [roomTypeToCreate, setRoomTypeToCreate] = useState<'shared' | 'event'>('shared');

  const loadRooms = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await listMyRooms();
      setRooms(data);
    } catch (err) {
      if (!silent) Alert.alert('Error', 'Failed to load rooms.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadRooms(true);
    });
    loadRooms();
    return unsubscribe;
  }, [navigation, loadRooms]);

  const handleCreateRoom = (type: 'shared' | 'event') => {
    setRoomNameInput('');
    setRoomTypeToCreate(type);
    setCreateModalVisible(true);
  };

  const onSubmitCreateRoom = async () => {
    const name = roomNameInput.trim();
    if (!name) return;
    
    try {
      setCreateModalVisible(false);
      setLoading(true);
      const result = await createRoom(name, roomTypeToCreate);

      // Parse room_key from QR payload and save to SecureStore.
      // This ensures the creator uses the same permutation key as members.
      try {
        const parsed = JSON.parse(result.qr_payload);
        const roomKey = parsed.room_key || result.room_id;
        await SecureStore.setItemAsync(`Plexida_room_key_${result.room_id}`, roomKey);
      } catch (e) {
        console.warn('[Room] Could not save room_key to SecureStore:', e);
      }

      loadRooms(true);
      navigation.navigate('RoomQR', {
        roomId: result.room_id,
        roomName: result.room_name,
        qrPayload: result.qr_payload,
        showTimer: true,
      });
    } catch (err) {
      Alert.alert('Error', 'Could not create room.');
      setLoading(false);
    }
  };

  const handleJoinRoom = () => {
    navigation.navigate('RoomJoin');
  };

  const handleRoomLongPress = (room: Room) => {
    const isCreator = room.my_role === 'creator';
    
    if (isCreator) {
      Alert.alert(
        "Delete Room",
        `Are you sure you want to permanently delete "${room.name}"? This will remove all photos and kick out all members.`,
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Delete", 
            style: "destructive", 
            onPress: async () => {
              setLoading(true);
              try {
                await deleteRoom(room.id);
                setRooms(prev => prev.filter(r => r.id !== room.id));
              } catch (e) {
                Alert.alert("Error", "Could not delete room");
              } finally {
                setLoading(false);
              }
            } 
          }
        ]
      );
    } else {
      Alert.alert(
        "Leave Room",
        `Are you sure you want to leave "${room.name}"? You will lose access to its photos.`,
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Leave", 
            style: "destructive", 
            onPress: async () => {
              setLoading(true);
              try {
                await leaveRoom(room.id);
                setRooms(prev => prev.filter(r => r.id !== room.id));
              } catch (e) {
                Alert.alert("Error", "Could not leave room");
              } finally {
                setLoading(false);
              }
            } 
          }
        ]
      );
    }
  };

  return (
    <AnimatedBackground orbs={[{ color: 'rgba(0,212,255,0.1)', size: 150, top: -20, left: -30 }]}>
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Rooms</Text>
          </View>

          <ScrollView
            style={styles.list}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingBottom: 20 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadRooms(); }} tintColor={palette.violet2} />}
          >
            {loading && rooms.length === 0 ? (
              <View style={{ gap: 12 }}>
                {[1, 2].map(i => (
                  <GlassCard key={i} style={styles.roomCard}>
                    <SkeletonLoader width="60%" height={18} />
                    <SkeletonLoader width="40%" height={14} style={{ marginTop: 8 }} />
                  </GlassCard>
                ))}
              </View>
            ) : rooms.length === 0 ? (
              <EmptyState 
                iconType="album"
                title="No rooms yet"
                subtitle="Create a room to share photos with friends, or scan a QR code to join one."
              />
            ) : (
              rooms.map((room) => {
                const isCreator = room.my_role === 'creator';
                const isPending = room.my_status === 'pending';
                const typeIcon = room.room_type === 'event' ? 'mic' : 'home';

                return (
                  <TouchableOpacity
                    key={room.id}
                    onPress={() => {
                      if (!isPending) navigation.navigate('RoomDetail', { roomId: room.id, roomName: room.name });
                    }}
                    onLongPress={() => handleRoomLongPress(room)}
                    activeOpacity={isPending ? 1 : 0.7}
                  >
                    <GlassCard style={styles.roomCard}>
                      <View style={styles.roomHeader}>
                        <View style={styles.roomTitleRow}>
                          <Feather name={typeIcon as any} size={16} color={palette.silver2} />
                          <Text style={styles.roomTitle}>{room.name}</Text>
                        </View>
                        {isPending && (
                          <View style={styles.badgePending}>
                            <Text style={styles.badgeTextPending}>Pending</Text>
                          </View>
                        )}
                        {isCreator && (
                          <View style={styles.badgeCreator}>
                            <Text style={styles.badgeTextCreator}>Creator</Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.roomStats}>
                        <Text style={styles.roomStatText}>{room.photo_count} photos</Text>
                        <Text style={styles.roomStatText}> • </Text>
                        <Text style={styles.roomStatText}>{room.member_count} members</Text>
                      </View>

                      {room.expires_at && (
                        <Text style={styles.roomExpiry}>
                          Expires: {new Date(room.expires_at).toLocaleDateString()}
                        </Text>
                      )}
                    </GlassCard>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>

        <MockupBottomTabs activeTab="rooms" />
      </View>

      {/* Custom Room Creation Modal */}
      <Modal
        visible={createModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <GlassCard style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create New Room</Text>
            <Text style={styles.modalSubtitle}>Enter a name for your collaborative room:</Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Summer Party 2026"
              placeholderTextColor={palette.muted}
              value={roomNameInput}
              onChangeText={setRoomNameInput}
              autoFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.modalCancelBtn} 
                onPress={() => setCreateModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalCreateBtn, !roomNameInput.trim() && styles.modalCreateBtnDisabled]} 
                onPress={onSubmitCreateRoom}
                disabled={!roomNameInput.trim()}
              >
                <LinearGradient 
                  colors={palette.gradient.hero} 
                  start={{ x: 0, y: 0 }} 
                  end={{ x: 1, y: 1 }} 
                  style={styles.modalCreateBtnGrad}
                >
                  <Text style={styles.modalCreateBtnText}>Create</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </GlassCard>
        </View>
      </Modal>
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 60 },
  header: { marginBottom: 20 },
  headerTitle: { fontFamily: getFont('Syne', '800'), fontSize: 24, color: palette.white },



  list: { flex: 1 },
  roomCard: { padding: 16, gap: 8 },
  roomHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roomTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  roomIcon: { fontSize: 18 },
  roomTitle: { fontFamily: getFont('Syne', '700'), fontSize: 16, color: palette.silver2, flex: 1 },
  
  badgePending: { backgroundColor: 'rgba(255,180,0,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,180,0,0.3)' },
  badgeTextPending: { color: palette.amber, fontSize: 10, fontWeight: '700' },
  
  badgeCreator: { backgroundColor: 'rgba(123,92,245,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(123,92,245,0.3)' },
  badgeTextCreator: { color: palette.violet2, fontSize: 10, fontWeight: '700' },

  roomStats: { flexDirection: 'row', alignItems: 'center' },
  roomStatText: { color: palette.muted, fontSize: 12, fontFamily: getFont('DMSans', '400') },
  
  roomExpiry: { color: palette.muted, fontSize: 11, fontFamily: getFont('DMSans', '400'), marginTop: 4 },

  /* Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 15, 19, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    padding: 24,
    gap: 16,
  },
  modalTitle: {
    fontFamily: getFont('Syne', '800'),
    fontSize: 20,
    color: palette.white,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontFamily: getFont('DMSans', '500'),
    fontSize: 13,
    color: palette.silver2,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: palette.glass2,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: palette.white,
    fontFamily: getFont('DMSans', '400'),
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancelBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: palette.glass,
  },
  modalCancelBtnText: {
    color: palette.silver2,
    fontFamily: getFont('Syne', '700'),
    fontSize: 14,
  },
  modalCreateBtn: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalCreateBtnGrad: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCreateBtnDisabled: {
    opacity: 0.5,
  },
  modalCreateBtnText: {
    color: palette.white,
    fontFamily: getFont('Syne', '700'),
    fontSize: 14,
  },
});
