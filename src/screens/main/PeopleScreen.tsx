import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

import AnimatedBackground from '../../components/AnimatedBackground';
import GlassCard from '../../components/GlassCard';
import MockupBottomTabs from '../../components/MockupBottomTabs';
import SkeletonLoader from '../../components/SkeletonLoader';
import EmptyState from '../../components/EmptyState';
import { getYourPeople, PersonSummary } from '../../services/people';
import { palette, getFont } from '../../theme';
import { RootStackParamList } from '../../types';
import FaceAvatar from '../../components/FaceAvatar';
import { useAuth } from '../../context/AuthContext';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'People'>;

export default function PeopleScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuth();
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const fetchPeople = async () => {
    try {
      const data = await getYourPeople();
      setPeople(data);
    } catch (e) {
      console.error('Failed to fetch people', e);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPeople();
    setRefreshing(false);
  };

  useEffect(() => {
    let isMounted = true;
    const initialFetch = async () => {
      await fetchPeople();
      if (isMounted) setLoading(false);
    };
    initialFetch();
    return () => { isMounted = false; };
  }, []);

  return (
    <AnimatedBackground>
      <View style={{ flex: 1 }}>
        <View style={styles.content}>
          <View style={styles.topBar}>
            <View>
              <Text style={styles.headerTitle}>Your People</Text>
              <Text style={styles.headerSub}>Aggregated faces from all your albums</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('Settings' as any)}>
              <LinearGradient
                colors={palette.gradient.hero}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.avatarBtn}
              >
                <Text style={{ color: '#fff', fontFamily: getFont('Syne', '700'), fontSize: 16 }}>
                  {user?.username?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {loading && people.length === 0 ? (
            <ScrollView style={styles.grid} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {[1, 2, 3, 4, 5, 6].map(i => (
                <View key={i} style={styles.gridCardPress}>
                  <GlassCard style={styles.gridCard}>
                    <SkeletonLoader width={64} height={64} borderRadius={32} />
                    <SkeletonLoader width={80} height={14} style={{ marginTop: 12 }} />
                    <SkeletonLoader width={50} height={10} style={{ marginTop: 4 }} />
                  </GlassCard>
                </View>
              ))}
            </ScrollView>
          ) : (
            <ScrollView 
              style={styles.grid} 
              contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 20 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.violet2} />
              }
            >
              {people.length === 0 ? (
                <EmptyState 
                  iconType="people"
                  title="No named people yet"
                  subtitle="Rename a cluster in any album to see them here!"
                />
              ) : (
                [...people].sort((a, b) => {
                  if (a.name === 'Me') return -1;
                  if (b.name === 'Me') return 1;
                  return b.total_faces - a.total_faces;
                }).map(person => (
                  <TouchableOpacity
                    key={person.name}
                    style={styles.gridCardPress}
                    onPress={() => navigation.navigate('PersonDetail', { personName: person.name })}
                  >
                    <GlassCard style={styles.gridCard}>
                      <View>
                        {person.thumbnail_album_id && person.thumbnail_photo_id ? (
                          <FaceAvatar
                            albumId={person.thumbnail_album_id}
                            photoId={person.thumbnail_photo_id}
                            bbox={person.thumbnail_bbox || [0,0,0,0]}
                            size={64}
                          />
                        ) : (
                          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: palette.glass, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: palette.muted, fontSize: 24 }}>?</Text>
                          </View>
                        )}
                        {/* Photo Count Badge overlay */}
                        <View style={styles.badgeContainer}>
                          <Text style={styles.badgeText}>{person.total_faces}</Text>
                        </View>
                      </View>
                      <Text style={styles.nameText} numberOfLines={1}>{person.name}</Text>
                    </GlassCard>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          )}
        </View>

        <MockupBottomTabs activeTab="people" />
      </View>
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 60 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  headerTitle: { fontFamily: getFont('Syne', '800'), fontSize: 24, color: palette.silver2 },
  headerSub: { fontSize: 12, color: palette.muted, fontFamily: getFont('DMSans', '400'), marginTop: 4 },
  avatarBtn: { width: 40, height: 40, backgroundColor: palette.glass2, borderWidth: 1, borderColor: palette.border, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  grid: { flex: 1 },
  gridCardPress: { width: '48%', marginBottom: 8 },
  gridCard: { padding: 16, alignItems: 'center', height: 'auto' },
  nameText: { fontFamily: getFont('Syne', '700'), fontSize: 14, color: palette.silver2, textAlign: 'center', marginTop: 12 },
  countText: { fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400'), marginTop: 4 },
  badgeContainer: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: 'rgba(123,92,245,0.9)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: getFont('DMSans', '700'),
  },
});
