/**
 * PendingRequestsScreen — Creator view to approve or reject join requests.
 *
 * Route params: { roomId: string, roomName: string }
 *
 * Polls every 15 seconds for new requests while the screen is mounted.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { palette } from '../../theme';
import { RootStackParamList } from '../../types';
import {
  listPendingRequests,
  approveMember,
  rejectMember,
  RoomMember,
} from '../../services/rooms';

type RouteProps = RouteProp<RootStackParamList, 'PendingRequests'>;
type NavProps = NativeStackNavigationProp<RootStackParamList>;

export default function PendingRequestsScreen() {
  const navigation = useNavigation<NavProps>();
  const route = useRoute<RouteProps>();
  const { roomId, roomName } = route.params;

  const [requests, setRequests] = useState<RoomMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await listPendingRequests(roomId);
      setRequests(data);
    } catch {
      if (!silent) Alert.alert('Error', 'Could not load join requests.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [roomId]);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 15000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleApprove(member: RoomMember) {
    setActioningId(member.user_id);
    try {
      await approveMember(roomId, member.user_id);
      setRequests(prev => prev.filter(m => m.user_id !== member.user_id));
    } catch {
      Alert.alert('Error', 'Could not approve member.');
    } finally {
      setActioningId(null);
    }
  }

  async function handleReject(member: RoomMember) {
    Alert.alert(
      'Reject Request',
      `Reject ${member.display_name}'s join request?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setActioningId(member.user_id);
            try {
              await rejectMember(roomId, member.user_id);
              setRequests(prev => prev.filter(m => m.user_id !== member.user_id));
            } catch {
              Alert.alert('Error', 'Could not reject member.');
            } finally {
              setActioningId(null);
            }
          },
        },
      ]
    );
  }

  function renderRequest({ item }: { item: RoomMember }) {
    const isActioning = actioningId === item.user_id;
    const initial = item.display_name?.[0]?.toUpperCase() || '?';

    return (
      <View style={styles.requestCard}>
        {/* Avatar */}
        <LinearGradient
          colors={palette.gradient.hero}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{initial}</Text>
        </LinearGradient>

        {/* Info */}
        <View style={styles.requestInfo}>
          <Text style={styles.requestName}>{item.display_name || 'Unknown User'}</Text>
          <Text style={styles.requestTime}>
            Requested {item.role === 'uploader' ? 'Uploader' : (item.role === 'viewer' ? 'Viewer' : 'Attendee')} Access
          </Text>
        </View>

        {/* Actions */}
        {isActioning ? (
          <ActivityIndicator color={palette.violet2} style={{ width: 80 }} />
        ) : (
          <View style={styles.requestActions}>
            <TouchableOpacity
              style={styles.rejectBtn}
              onPress={() => handleReject(item)}
              activeOpacity={0.7}
            >
              <Text style={styles.rejectBtnText}>✕</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.approveBtn}
              onPress={() => handleApprove(item)}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={palette.gradient.hero}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.approveBtnGrad}
              >
                <Text style={styles.approveBtnText}>✓</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Join Requests</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{roomName}</Text>
        </View>
        {requests.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{requests.length}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.violet2} />
          <Text style={styles.loadingText}>Loading requests...</Text>
        </View>
      ) : requests.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="inbox" size={56} color={palette.silver} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>No pending requests</Text>
          <Text style={styles.emptySub}>
            New join requests will appear here automatically every 15 seconds.
          </Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={item => item.user_id}
          renderItem={renderRequest}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={palette.violet2}
            />
          }
          ListHeaderComponent={
            <Text style={styles.listHeader}>
              Approve or reject each request. Members only gain access once approved.
            </Text>
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backArrow: { fontSize: 22, color: palette.silver },
  headerCenter: { flex: 1, marginHorizontal: 8 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: palette.white },
  headerSub: { fontSize: 12, color: palette.muted, marginTop: 2 },
  countBadge: {
    backgroundColor: palette.violet,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 28,
    alignItems: 'center',
  },
  countBadgeText: { color: palette.white, fontWeight: '700', fontSize: 13 },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: palette.muted, fontSize: 14 },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: palette.white, marginBottom: 10 },
  emptySub: { fontSize: 14, color: palette.muted, textAlign: 'center', lineHeight: 22 },

  list: { padding: 20 },
  listHeader: { color: palette.muted, fontSize: 13, marginBottom: 16, lineHeight: 20 },

  requestCard: {
    backgroundColor: palette.glass,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },

  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: palette.white, fontWeight: '700', fontSize: 18 },

  requestInfo: { flex: 1 },
  requestName: { color: palette.white, fontWeight: '600', fontSize: 15 },
  requestTime: { color: palette.muted, fontSize: 12, marginTop: 2 },

  requestActions: { flexDirection: 'row', gap: 8 },
  rejectBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: palette.red,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectBtnText: { color: palette.red, fontSize: 16, fontWeight: '700' },
  approveBtn: { width: 38, height: 38, borderRadius: 19, overflow: 'hidden' },
  approveBtnGrad: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  approveBtnText: { color: palette.white, fontSize: 16, fontWeight: '700' },
});
