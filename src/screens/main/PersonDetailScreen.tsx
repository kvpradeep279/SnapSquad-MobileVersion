import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image, Dimensions } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';
import { getFirebaseIdToken } from '../../services/auth';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AnimatedBackground from '../../components/AnimatedBackground';
import EmptyState from '../../components/EmptyState';
import { getPersonPhotos, PersonPhoto } from '../../services/people';
import { palette, getFont } from '../../theme';
import { RootStackParamList } from '../../types';
import api from '../../services/api';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'PersonDetail'>;
type RoutePropType = RouteProp<RootStackParamList, 'PersonDetail'>;

const { width } = Dimensions.get('window');
const COLUMNS = 3;
const GAP = 2;
const PHOTO_SIZE = (width - (COLUMNS - 1) * GAP) / COLUMNS;

export default function PersonDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { personName } = route.params;

  const [photos, setPhotos] = useState<PersonPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [authToken, setAuthToken] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchPhotos = async () => {
      try {
        const token = await getFirebaseIdToken();
        if (isMounted) setAuthToken(token);

        const data = await getPersonPhotos(personName);
        if (isMounted) setPhotos(data);
      } catch (e) {
        console.error('Failed to fetch person photos', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchPhotos();
    return () => { isMounted = false; };
  }, [personName]);

  return (
    <AnimatedBackground>
      <View style={{ flex: 1, paddingTop: Math.max(insets.top + 10, 60) }}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <Path d="M10 3L5 8l5 5" stroke={palette.silver} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </Svg>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{personName}</Text>
          <View style={{ width: 36 }} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={palette.violet2} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
            {photos.length === 0 ? (
              <View style={{ marginTop: 60 }}>
                <EmptyState 
                  icon="🔍"
                  title="No Photos Found"
                  description="We couldn't find any photos for this person across your albums."
                />
              </View>
            ) : (
              <>
                <View style={styles.headerStats}>
                  <Text style={styles.headerSub}>
                    {photos.length} deduplicated photos found across your albums.
                  </Text>
                </View>

            <View style={styles.grid}>
              {photos.map(p => (
                <View key={p.photo_id} style={styles.photoContainer}>
                  <Image
                    source={{
                      uri: `${api.defaults.baseURL}/albums/${p.album_id}/photos/${p.photo_id}/raw`,
                      headers: { Authorization: `Bearer ${authToken}` }
                    }}
                    style={styles.photo}
                  />
                </View>
              ))}
            </View>
              </>
            )}
          </ScrollView>
        )}
      </View>
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16 },
  backBtn: { width: 36, height: 36, backgroundColor: palette.glass2, borderWidth: 1, borderColor: palette.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: getFont('Syne', '800'), fontSize: 18, color: palette.silver2 },
  headerStats: { paddingHorizontal: 20, marginBottom: 16 },
  headerSub: { fontSize: 13, color: palette.muted, fontFamily: getFont('DMSans', '400') },
  
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  photoContainer: { width: PHOTO_SIZE, height: PHOTO_SIZE },
  photo: { width: '100%', height: '100%' },
});
