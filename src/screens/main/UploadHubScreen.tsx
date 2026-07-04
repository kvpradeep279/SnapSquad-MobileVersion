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

export default function UploadHubScreen() {
  const navigation = useNavigation<NavProp>();
  const [loading, setLoading] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [roomNameInput, setRoomNameInput] = useState('');
  const [roomTypeToCreate, setRoomTypeToCreate] = useState<'shared' | 'event'>('shared');

  useEffect(() => {
    // No-op for loadRooms since rooms are not listed here
  }, []);

  const handleCreateRoom = (type: 'shared' | 'event') => {
    setRoomNameInput('');
    setRoomTypeToCreate(type);
    setCreateModalVisible(true);
  };

  const onSubmitCreateRoom = async () => {
    const name = roomNameInput.trim();
    if (!name) return;
    
    try {
      setLoading(true);
      const result = await createRoom(name, roomTypeToCreate);

      // Parse room_key from QR payload and save to SecureStore.
      // This ensures the creator uses the same permutation key as members.
      try {
        const parsed = JSON.parse(result.qr_payload);
        const roomKey = parsed.room_key || result.room_id;
        await SecureStore.setItemAsync(`snapsquad_room_key_${result.room_id}`, roomKey);
      } catch (e) {
        console.warn('[Room] Could not save room_key to SecureStore:', e);
      }

      setCreateModalVisible(false);
      setLoading(false);
      
      // We don't loadRooms here anymore since we don't list them
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



  return (
    <AnimatedBackground orbs={[{ color: 'rgba(0,212,255,0.1)', size: 150, top: -20, left: -30 }]}>
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Upload Hub</Text>
          </View>

          <View style={styles.actionsColumn}>
            <TouchableOpacity style={styles.actionBtnFull} onPress={() => navigation.navigate('Upload' as never)}>
              <LinearGradient colors={palette.gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionBtnGradFull}>
                <Feather name="lock" size={20} color={palette.white} style={{ marginRight: 16 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionBtnTextFull}>Personal Album</Text>
                  <Text style={styles.actionBtnSubFull}>Only you can view and upload</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtnFull} onPress={() => handleCreateRoom('shared')}>
              <LinearGradient colors={palette.gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionBtnGradFull}>
                <Feather name="users" size={20} color={palette.white} style={{ marginRight: 16 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionBtnTextFull}>Public Shared Room</Text>
                  <Text style={styles.actionBtnSubFull}>Collaborative album. Everyone views and uploads.</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtnFull} onPress={() => handleCreateRoom('event')}>
              <LinearGradient colors={palette.gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionBtnGradFull}>
                <Feather name="camera" size={20} color={palette.white} style={{ marginRight: 16 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionBtnTextFull}>Private Event Room</Text>
                  <Text style={styles.actionBtnSubFull}>Host only God View. Guests upload and search.</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity style={styles.scanBtnOutline} onPress={handleJoinRoom}>
            <Feather name="link" size={18} color={palette.silver2} style={{ marginRight: 8 }} />
            <Text style={styles.scanBtnOutlineText}>Join a Room</Text>
          </TouchableOpacity>

        </View>

        <MockupBottomTabs activeTab="upload" />
      </View>

      {/* Custom Room Creation Modal */}
      <Modal
        visible={createModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Create New {roomTypeToCreate === 'shared' ? 'Public Shared Room' : 'Private Event Room'}
            </Text>
            <Text style={styles.modalSubtitle}>Enter a name for your room:</Text>
            
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
                disabled={!roomNameInput.trim() || loading}
              >
                <LinearGradient 
                  colors={palette.gradient.hero}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.modalCreateBtnGrad}
                >
                  <Text style={styles.modalCreateBtnText}>{loading ? 'Creating...' : 'Create'}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  headerTitle: { fontFamily: getFont('Syne', '800'), fontSize: 24, color: palette.silver2 },
  
  actionsColumn: {
    gap: 16,
    marginBottom: 32,
  },
  actionBtnFull: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  actionBtnGradFull: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  actionBtnTextFull: {
    fontFamily: getFont('Syne', '700'),
    fontSize: 16,
    color: palette.white,
    marginBottom: 4,
  },
  actionBtnSubFull: {
    fontFamily: getFont('DMSans', '400'),
    fontSize: 12,
    color: palette.silver2,
    opacity: 0.8,
  },
  
  scanBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: palette.border2,
    borderRadius: 20,
    backgroundColor: palette.glass,
  },
  scanBtnOutlineText: {
    fontFamily: getFont('Syne', '700'),
    fontSize: 15,
    color: palette.silver2,
  },

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
    backgroundColor: '#000000',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
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
    color: palette.white,
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
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#22222A',
  },
  modalCancelBtnText: {
    color: palette.white,
    fontFamily: getFont('Syne', '700'),
    fontSize: 15,
  },
  modalCreateBtn: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalCreateBtnGrad: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  modalCreateBtnDisabled: {
    opacity: 0.5,
  },
  modalCreateBtnText: {
    color: palette.white,
    fontFamily: getFont('Syne', '700'),
    fontSize: 15,
  },
});
