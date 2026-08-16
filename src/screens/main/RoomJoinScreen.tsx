/**
 * RoomJoinScreen — Camera QR scanner for joining a room.
 *
 * Flow:
 *   1. Request camera permission
 *   2. Scan QR code → parse {room_id, room_name}
 *   3. Call POST /rooms/{room_id}/request-join
 *   4. Show result: pending / already member / error
 *
 * Route params: none (accessible from RoomsScreen or deep link)
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Animated,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Feather } from '@expo/vector-icons';

import { palette } from '../../theme';
import { getFont } from '../../theme';
import { RootStackParamList } from '../../types';
import { requestJoin, getRoomBasicInfo } from '../../services/rooms';
import * as SecureStore from 'expo-secure-store';

type NavProps = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'RoomJoin'>;

type ScanState = 'scanning' | 'role_select' | 'loading' | 'success' | 'already_member' | 'error';

export default function RoomJoinScreen() {
  const navigation = useNavigation<NavProps>();
  const route = useRoute<RouteProps>();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanState, setScanState] = useState<ScanState>('scanning');
  const [resultMessage, setResultMessage] = useState('');
  const [scannedRoom, setScannedRoom] = useState<{ room_id: string; room_name: string } | null>(null);
  const [selectedRole, setSelectedRole] = useState<'viewer' | 'uploader'>('viewer');
  
  const initialRoomId = route.params?.roomId || '';
  const [joinMethod, setJoinMethod] = useState<'selection' | 'camera' | 'text'>(initialRoomId ? 'text' : 'selection');
  const [manualRoomId, setManualRoomId] = useState(initialRoomId);
  const scanned = useRef(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (scanState !== 'scanning') {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [scanState]);

  async function handleBarCodeScanned({ data }: { data: string }) {
    if (scanned.current) return;
    scanned.current = true;

    // Parse QR payload
    let parsed: { room_id?: string; room_name?: string; room_key?: string; room_type?: string } = {};
    try {
      parsed = JSON.parse(data);
    } catch {
      setScanState('error');
      setResultMessage('Invalid QR code — not a Plexida room.');
      return;
    }

    if (!parsed.room_id) {
      setScanState('error');
      setResultMessage('Invalid QR code — missing room ID.');
      return;
    }

    // Save the shared room key to SecureStore immediately on scan.
    // This ensures this member uses the same permutation space as the creator.
    const roomKey = parsed.room_key || parsed.room_id;
    try {
      await SecureStore.setItemAsync(`Plexida_room_key_${parsed.room_id}`, roomKey);
    } catch (e) {
      console.warn('[RoomJoin] Could not save room_key:', e);
    }

    setScannedRoom({ room_id: parsed.room_id, room_name: parsed.room_name || 'Unknown Room' });
    
    // If it's a shared room, everyone is an attendee, skip role selection
    if (parsed.room_type === 'shared') {
      submitJoinRequest('attendee', parsed.room_id);
    } else {
      // Show role selection before submitting for event rooms
      setScanState('role_select');
    }
  }

  async function submitJoinRequest(overrideRole?: 'viewer' | 'uploader' | 'attendee', overrideRoomId?: string) {
    const rId = overrideRoomId || scannedRoom?.room_id;
    if (!rId) return;
    
    const roleToUse = overrideRole || selectedRole;
    setScanState('loading');
    try {
      const result = await requestJoin(rId, roleToUse);
      if (result.status === 'approved') {
        setScanState('already_member');
        setResultMessage('You\'re already a member of this room!');
      } else {
        setScanState('success');
        const roleLabel = roleToUse === 'uploader' ? 'as an Uploader' : (roleToUse === 'attendee' ? 'as an Attendee' : 'as a Viewer');
        setResultMessage(`Join request sent ${roleLabel}! Waiting for the creator to approve.`);
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail || '';
      if (err?.response?.status === 404) {
        setScanState('error');
        setResultMessage('Room not found or has expired.');
      } else if (err?.response?.status === 400 && detail.toLowerCase().includes('full')) {
        setScanState('error');
        setResultMessage('This room is full and cannot accept more members.');
      } else {
        setScanState('error');
        setResultMessage('Something went wrong. Please try again.');
      }
    }
  }

  function handleRescan() {
    scanned.current = false;
    setScannedRoom(null);
    setResultMessage('');
    setSelectedRole('member');
    fadeAnim.setValue(0);
    setScanState('scanning');
    setJoinMethod('selection');
    setManualRoomId('');
  }

  // ── Selection State ──────────────────────────────────────────────
  if (joinMethod === 'selection') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.scanTitle}>Join a Room</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.selectionContainer}>
          <View style={styles.selectionCard}>
            <View style={styles.selectionIconBox}>
              <Feather name="maximize" size={32} color={palette.cyan} />
            </View>
            <Text style={styles.selectionTitle}>Have a QR Code?</Text>
            <Text style={styles.selectionSub}>Scan a friend's room QR to join instantly</Text>
            
            <TouchableOpacity 
              style={[styles.actionBtn, { width: '100%' }]} 
              onPress={() => setJoinMethod('camera')}
            >
              <LinearGradient colors={palette.gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                <Text style={styles.actionBtnText}>Scan QR Code</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={styles.selectionDivider} />

          <View style={styles.selectionCard}>
            <View style={styles.selectionIconBox}>
              <Feather name="hash" size={32} color={palette.violet2} />
            </View>
            <Text style={styles.selectionTitle}>Have a Room ID?</Text>
            <Text style={styles.selectionSub}>Enter the room ID to join</Text>
            
            <TouchableOpacity 
              style={[styles.rescanBtn, { width: '100%' }]} 
              onPress={() => setJoinMethod('text')}
            >
              <Text style={styles.rescanText}>Enter Room ID</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Text Entry State ──────────────────────────────────────────────
  if (joinMethod === 'text' && scanState === 'scanning') {
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => setJoinMethod('selection')} style={styles.closeBtn}>
              <Feather name="arrow-left" size={24} color={palette.white} />
            </TouchableOpacity>
            <Text style={styles.scanTitle}>Enter Room ID</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.textEntryContainer}>
            <View style={styles.textEntryBox}>
              <Feather name="hash" size={24} color={palette.silver2} style={{ marginRight: 12 }} />
              <TextInput
                style={styles.textInput}
                placeholder="Paste Room ID here"
                placeholderTextColor={palette.muted}
                value={manualRoomId}
                onChangeText={setManualRoomId}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <TouchableOpacity 
              style={[styles.actionBtn, { opacity: manualRoomId.trim() ? 1 : 0.5 }]} 
              onPress={async () => {
                if (!manualRoomId.trim()) return;
                try {
                  const info = await getRoomBasicInfo(manualRoomId.trim());
                  setScannedRoom({ room_id: info.id, room_name: info.name });
                  setScanState('role_select');
                } catch {
                  setScannedRoom({ room_id: manualRoomId.trim(), room_name: 'Unknown Room' });
                  setScanState('role_select');
                }
              }}
              disabled={!manualRoomId.trim()}
            >
              <LinearGradient colors={palette.gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                <Text style={styles.actionBtnText}>Continue</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Permission not granted (Camera) ──────────────────────────────────────
  if (joinMethod === 'camera') {
    if (!permission) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={palette.violet2} />
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <SafeAreaView style={styles.safe}>
          <View style={styles.permissionContainer}>
            <Text style={styles.permissionEmoji}>📷</Text>
            <Text style={styles.permissionTitle}>Camera Access Needed</Text>
            <Text style={styles.permissionSub}>
              Plexida needs camera access to scan room QR codes.
            </Text>
            <TouchableOpacity onPress={requestPermission} style={styles.permissionBtn} activeOpacity={0.85}>
              <LinearGradient
                colors={palette.gradient.hero}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.permissionBtnGrad}
              >
                <Text style={styles.permissionBtnText}>Allow Camera Access</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
  }

  // ── Result overlay ──────────────────────────────────────────────
  if (scanState !== 'scanning') {

    // ── Role Selection Step ──────────────────────────────────────
    if (scanState === 'role_select' && scannedRoom) {
      return (
        <SafeAreaView style={styles.safe}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => setScanState('scanning')} style={styles.closeBtn}>
              <Feather name="arrow-left" size={24} color={palette.white} />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
          </View>
          <Animated.View style={[styles.resultContainer, { opacity: fadeAnim, paddingTop: 10 }]}>
            <View style={styles.roomBadge}>
              <Feather name="home" size={14} color={palette.silver} style={{ marginRight: 6 }} />
              <Text style={styles.roomBadgeText}>{scannedRoom.room_name}</Text>
            </View>

            <Text style={styles.resultTitle}>How do you want to join?</Text>
            <Text style={styles.resultMessage}>
              Choose your role. The room creator will review and approve your request.
            </Text>

            <View style={{ width: '100%', gap: 12, marginBottom: 24 }}>
              <TouchableOpacity
                style={[styles.roleCard, selectedRole === 'viewer' && styles.roleCardActive]}
                onPress={() => setSelectedRole('viewer')}
                activeOpacity={0.8}
              >
                <Feather name="eye" size={24} color={selectedRole === 'viewer' ? palette.violet2 : palette.silver} />
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={[styles.roleCardTitle, selectedRole === 'viewer' && { color: palette.violet2 }]}>
                    Viewer
                  </Text>
                  <Text style={styles.roleCardSub}>Use "Find Me" to search for your photos</Text>
                </View>
                {selectedRole === 'viewer' && <Feather name="check-circle" size={20} color={palette.violet2} />}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.roleCard, selectedRole === 'uploader' && styles.roleCardActive]}
                onPress={() => setSelectedRole('uploader')}
                activeOpacity={0.8}
              >
                <Feather name="upload" size={24} color={selectedRole === 'uploader' ? palette.violet2 : palette.silver} />
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={[styles.roleCardTitle, selectedRole === 'uploader' && { color: palette.violet2 }]}>
                    Request Uploader Access
                  </Text>
                  <Text style={styles.roleCardSub}>Upload photos to this room (requires approval)</Text>
                </View>
                {selectedRole === 'uploader' && <Feather name="check-circle" size={20} color={palette.violet2} />}
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.actionBtn, { width: '100%' }]} onPress={() => submitJoinRequest()} activeOpacity={0.85}>
              <LinearGradient colors={palette.gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionBtnGrad}>
                <Text style={styles.actionBtnText}>Send Join Request</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </SafeAreaView>
      );
    }

    const isSuccess = scanState === 'success' || scanState === 'already_member';
    const emoji =
      scanState === 'success' ? '✅' :
      scanState === 'already_member' ? '🏠' :
      scanState === 'loading' ? '⏳' : '❌';
    const accentColor =
      scanState === 'success' ? palette.green :
      scanState === 'already_member' ? palette.cyan :
      scanState === 'error' ? palette.red : palette.muted;

    return (
      <SafeAreaView style={styles.safe}>
        <Animated.View style={[styles.resultContainer, { opacity: fadeAnim }]}>
          {scanState === 'loading' ? (
            <ActivityIndicator size="large" color={palette.violet2} style={{ marginBottom: 20 }} />
          ) : (
            <Text style={styles.resultEmoji}>{emoji}</Text>
          )}

          {scannedRoom && (
            <View style={styles.roomBadge}>
              <Text style={styles.roomBadgeText}>🏠 {scannedRoom.room_name}</Text>
            </View>
          )}

          <Text style={[styles.resultTitle, { color: accentColor }]}>
            {scanState === 'loading' ? 'Sending request...' :
             scanState === 'success' ? 'Request Sent!' :
             scanState === 'already_member' ? 'Already a Member' : 'Could not join'}
          </Text>
          <Text style={styles.resultMessage}>{resultMessage}</Text>

          <View style={styles.resultActions}>
            {isSuccess && scannedRoom ? (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => navigation.goBack()}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={palette.gradient.hero}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.actionBtnGrad}
                >
                  <Text style={styles.actionBtnText}>Back to Rooms</Text>
                </LinearGradient>
              </TouchableOpacity>
            ) : null}
            {!isSuccess || scanState === 'error' ? (
              <TouchableOpacity onPress={handleRescan} style={styles.rescanBtn} activeOpacity={0.7}>
                <Text style={styles.rescanText}>Scan Again</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  // ── Camera scanner ──────────────────────────────────────────────
  if (joinMethod === 'camera') {
    return (
      <View style={styles.cameraContainer}>
        <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleBarCodeScanned}
      />
      {/* Overlay */}
      <SafeAreaView style={styles.overlay}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.scanTitle}>Scan Room QR Code</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Viewfinder */}
        <View style={styles.viewfinderWrapper}>
          <View style={styles.viewfinder}>
            {/* Corner brackets */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        </View>

        <Text style={styles.scanHint}>Point your camera at a Plexida room QR code</Text>
      </SafeAreaView>
      </View>
    );
  }

  return null;
}

const CORNER_SIZE = 28;
const CORNER_BORDER = 3;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  center: { flex: 1, backgroundColor: palette.background, justifyContent: 'center', alignItems: 'center' },

  // Permission
  permissionContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  permissionEmoji: { fontSize: 56, marginBottom: 20 },
  permissionTitle: { fontSize: 22, fontWeight: '700', color: palette.white, marginBottom: 12, textAlign: 'center' },
  permissionSub: { fontSize: 14, color: palette.muted, textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  permissionBtn: { width: '100%', borderRadius: 16, overflow: 'hidden' },
  permissionBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  permissionBtnText: { color: palette.white, fontWeight: '700', fontSize: 16 },
  cancelText: { color: palette.muted, fontSize: 14 },
  // Selection
  selectionContainer: { flex: 1, padding: 24, justifyContent: 'center' },
  selectionCard: {
    backgroundColor: palette.glass,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  selectionIconBox: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: palette.glass2,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  selectionTitle: { color: palette.white, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  selectionSub: { color: palette.muted, fontSize: 14, textAlign: 'center', marginBottom: 24, paddingHorizontal: 10 },
  selectionDivider: { height: 16 },

  // Text Entry
  textEntryContainer: { flex: 1, padding: 24, paddingTop: 40 },
  textEntryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    marginBottom: 24,
  },
  textInput: {
    flex: 1,
    color: palette.white,
    fontSize: 16,
    fontFamily: getFont('DMSans', '400'),
  },


  // Camera
  cameraContainer: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'space-between', paddingBottom: 60 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    backgroundColor: 'rgba(5,13,24,0.6)',
  },
  closeBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  closeBtnText: { color: palette.white, fontSize: 18, fontWeight: '700' },
  scanTitle: { color: palette.white, fontSize: 16, fontWeight: '700' },

  viewfinderWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  viewfinder: { width: 240, height: 240, position: 'relative' },
  corner: { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE, borderColor: palette.cyan },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_BORDER, borderLeftWidth: CORNER_BORDER, borderTopLeftRadius: 6 },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_BORDER, borderRightWidth: CORNER_BORDER, borderTopRightRadius: 6 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_BORDER, borderLeftWidth: CORNER_BORDER, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_BORDER, borderRightWidth: CORNER_BORDER, borderBottomRightRadius: 6 },

  scanHint: {
    color: palette.silver,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 32,
    backgroundColor: 'rgba(5,13,24,0.7)',
    paddingVertical: 12,
  },

  // Result
  resultContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  resultEmoji: { fontSize: 64, marginBottom: 20 },
  roomBadge: {
    backgroundColor: palette.glass,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  roomBadgeText: { color: palette.silver, fontSize: 14, fontWeight: '600' },
  resultTitle: { color: palette.white, fontSize: 22, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  resultMessage: { fontSize: 14, color: palette.muted, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  resultActions: { width: '100%', gap: 12 },
  actionBtn: { borderRadius: 16, overflow: 'hidden' },
  actionBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  actionBtnText: { color: palette.white, fontWeight: '700', fontSize: 16 },
  rescanBtn: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  rescanText: { color: palette.silver, fontWeight: '600', fontSize: 15 },

  // Role Cards
  roleCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 14, backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.border },
  roleCardActive: { borderColor: palette.violet2, backgroundColor: 'rgba(123,92,245,0.12)' },
  roleCardTitle: { color: palette.silver2, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  roleCardSub: { color: palette.muted, fontSize: 12, lineHeight: 16 },
});
