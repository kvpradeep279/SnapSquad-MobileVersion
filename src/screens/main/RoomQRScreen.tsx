/**
 * RoomQRScreen — Display a QR code for the creator to share their room.
 *
 * Shows the room name, QR code (encodes JSON {room_id, room_name}),
 * expiry date, and a copy-link button.
 *
 * Route params: { roomId: string, roomName: string, qrPayload: string }
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';

import { palette } from '../../theme';
import { RootStackParamList } from '../../types';

type RouteProps = RouteProp<RootStackParamList, 'RoomQR'>;
type NavProps = NativeStackNavigationProp<RootStackParamList>;

export default function RoomQRScreen() {
  const navigation = useNavigation<NavProps>();
  const route = useRoute<RouteProps>();
  const { roomId, roomName, qrPayload, showTimer } = route.params;
  const [timeLeft, setTimeLeft] = useState(5);

  React.useEffect(() => {
    if (!showTimer) return;

    if (timeLeft <= 0) {
      navigateToRoom();
      return;
    }
    const interval = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft, showTimer]);

  const navigateToRoom = () => {
    navigation.replace('RoomDetail', { roomId, roomName });
  };

  async function handleShare() {
    try {
      await Share.share({
        message: `Join my Plexida room "${roomName}"!\n\nRoom ID: ${roomId}\n\n(Copy the Room ID above and select "Join a Room" in the Plexida app)`,
        title: `Join ${roomName} on Plexida`,
      });
    } catch {
      Alert.alert('Error', 'Could not share room link.');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} bounces={false}>
        {/* Header */}
        <View style={styles.header}>
          {showTimer ? (
            <TouchableOpacity onPress={navigateToRoom} style={styles.backBtn}>
              <Feather name="x" size={24} color={palette.silver} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Feather name="chevron-left" size={24} color={palette.silver} />
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>Room QR Code</Text>
          {showTimer ? (
            <View style={styles.timerContainer}>
              <Text style={styles.timerText}>{timeLeft}s</Text>
            </View>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {/* Room name pill */}
        <LinearGradient
          colors={palette.gradient.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.roomPill}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather name="home" size={16} color={palette.white} style={{ marginRight: 8 }} />
            <Text style={styles.roomPillText}>{roomName}</Text>
          </View>
        </LinearGradient>

        {/* QR card */}
        <View style={styles.qrCard}>
          <View style={styles.qrWrapper}>
            <QRCode
              value={qrPayload}
              size={220}
              color={palette.navy}
              backgroundColor={palette.white}
              logoSize={30}
            />
          </View>
          <Text style={styles.qrHint}>Members scan this to request to join</Text>
        </View>

        {/* Room ID badge */}
        <View style={styles.idBadge}>
          <Text style={styles.idLabel}>ROOM ID</Text>
          <Text style={styles.idValue} selectable>{roomId}</Text>
        </View>

        {/* Info row */}
        <View style={styles.infoRow}>
          <View style={styles.infoChip}>
            <Feather name="lock" size={16} color={palette.silver} style={{ marginRight: 4 }} />
            <Text style={styles.infoText}>Approval required</Text>
          </View>
          <View style={styles.infoChip}>
            <Feather name="clock" size={16} color={palette.silver} style={{ marginRight: 4 }} />
            <Text style={styles.infoText}>Expires in 90 days</Text>
          </View>
        </View>

        {/* Share button */}
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn} activeOpacity={0.85}>
          <LinearGradient
            colors={palette.gradient.hero}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.shareBtnGrad}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Feather name="share" size={18} color={palette.white} style={{ marginRight: 8 }} />
              <Text style={styles.shareBtnText}>Share Room Link</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  container: { padding: 24, alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 28,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backArrow: { fontSize: 22, color: palette.silver },
  headerTitle: { fontSize: 18, fontWeight: '700', color: palette.white },

  roomPill: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 30,
    marginBottom: 28,
  },
  roomPillText: { color: palette.white, fontWeight: '700', fontSize: 15 },

  qrCard: {
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  qrWrapper: {
    backgroundColor: palette.white,
    padding: 14,
    borderRadius: 16,
    marginBottom: 16,
  },
  qrHint: { color: palette.muted, fontSize: 13, textAlign: 'center' },

  idBadge: {
    backgroundColor: palette.glass,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: palette.border,
  },
  idLabel: { fontSize: 10, color: palette.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  idValue: { fontSize: 12, color: palette.cyan, fontFamily: 'monospace' },

  infoRow: { flexDirection: 'row', gap: 10, marginBottom: 28, width: '100%' },
  infoChip: {
    flex: 1,
    backgroundColor: palette.glass,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: palette.border,
  },
  infoEmoji: { fontSize: 14 },
  infoText: { color: palette.silver, fontSize: 11, flex: 1 },

  shareBtn: { width: '100%', borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  shareBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  shareBtnText: { color: palette.white, fontWeight: '700', fontSize: 16 },
  timerContainer: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  timerText: {
    color: palette.cyan,
    fontWeight: '700',
    fontSize: 16,
  },
});
