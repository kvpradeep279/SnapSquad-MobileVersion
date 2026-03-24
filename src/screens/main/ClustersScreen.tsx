import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import AnimatedBackground from '../../components/AnimatedBackground';
import GlassCard from '../../components/GlassCard';
import MockupBottomTabs from '../../components/MockupBottomTabs';
import { palette, getFont } from '../../theme';
import { RootStackParamList } from '../../types';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;

export default function ClustersScreen() {
  const navigation = useNavigation<NavProp>();

  return (
    <AnimatedBackground>
      <View style={{ flex: 1 }}>
        <View style={styles.content}>
          
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate('Home' as any)}>
              <Svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <Path d="M10 3L5 8l5 5" stroke={palette.silver} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </Svg>
            </TouchableOpacity>
            <View>
              <Text style={styles.headerTitle}>Cluster results</Text>
              <Text style={styles.headerSub}>College reunion 2025 · 8 people</Text>
            </View>
          </View>

          <View style={styles.filterRow}>
            <View style={[styles.filterPill, { backgroundColor: 'rgba(123,92,245,0.18)', borderColor: 'rgba(123,92,245,0.3)' }]}><Text style={{ color: palette.violet2, fontSize: 11, fontFamily: getFont('DMSans', '500') }}>All (8)</Text></View>
            <View style={styles.filterPillGhost}><Text style={styles.filterPillGhostText}>By size</Text></View>
            <View style={styles.filterPillGhost}><Text style={styles.filterPillGhostText}>Confidence</Text></View>
          </View>

          <ScrollView style={styles.grid} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            
            {/* Person 1 */}
            <TouchableOpacity style={styles.gridCardPress} onPress={() => navigation.navigate('ClusterDetail' as any)}>
              <GlassCard style={styles.gridCard}>
                <LinearGradient colors={['rgba(123,92,245,0.4)', 'rgba(0,212,255,0.3)']} style={[styles.avatarBox, { borderColor: palette.violet2 }]}>
                  <Text style={styles.emojiText}>👩</Text>
                </LinearGradient>
                <Text style={styles.nameText}>Anjali</Text>
                <Text style={styles.countText}>14 photos</Text>
                <View style={[styles.pill, { backgroundColor: 'rgba(0,220,130,0.12)', borderColor: 'rgba(0,220,130,0.25)' }]}><Text style={[styles.pillText, { color: '#4DEBA0' }]}>97%</Text></View>
              </GlassCard>
            </TouchableOpacity>

            {/* Person 2 */}
            <TouchableOpacity style={styles.gridCardPress} onPress={() => navigation.navigate('ClusterDetail' as any)}>
              <GlassCard style={styles.gridCard}>
                <LinearGradient colors={['rgba(0,212,255,0.3)', 'rgba(77,235,160,0.2)']} style={[styles.avatarBox, { borderColor: palette.cyan2 }]}>
                  <Text style={styles.emojiText}>👨</Text>
                </LinearGradient>
                <Text style={styles.nameText}>Rohan</Text>
                <Text style={styles.countText}>11 photos</Text>
                <View style={[styles.pill, { backgroundColor: 'rgba(0,220,130,0.12)', borderColor: 'rgba(0,220,130,0.25)' }]}><Text style={[styles.pillText, { color: '#4DEBA0' }]}>94%</Text></View>
              </GlassCard>
            </TouchableOpacity>

            {/* Person 3 */}
            <TouchableOpacity style={styles.gridCardPress} onPress={() => navigation.navigate('ClusterDetail' as any)}>
              <GlassCard style={styles.gridCard}>
                <LinearGradient colors={['rgba(255,208,96,0.2)', 'rgba(123,92,245,0.2)']} style={[styles.avatarBox, { borderColor: 'rgba(255,208,96,0.6)' }]}>
                  <Text style={styles.emojiText}>👩</Text>
                </LinearGradient>
                <Text style={styles.nameText}>Priya</Text>
                <Text style={styles.countText}>9 photos</Text>
                <View style={[styles.pill, { backgroundColor: 'rgba(255,180,0,0.12)', borderColor: 'rgba(255,180,0,0.25)' }]}><Text style={[styles.pillText, { color: '#FFD060' }]}>81%</Text></View>
              </GlassCard>
            </TouchableOpacity>

            {/* Unidentified */}
            <TouchableOpacity style={styles.gridCardPress} onPress={() => navigation.navigate('ClusterDetail' as any)}>
              <GlassCard style={styles.gridCard}>
                <View style={[styles.avatarBox, { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.2)', borderStyle: 'dashed' }]}>
                  <Svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <Circle cx="10" cy="7" r="3.5" stroke="rgba(200,208,224,0.3)" strokeWidth="1.3"/>
                    <Path d="M3 18c0-3.31 3.13-6 7-6" stroke="rgba(200,208,224,0.3)" strokeWidth="1.3" strokeLinecap="round"/>
                    <Path d="M15 14l2 2 3-3" stroke="rgba(200,208,224,0.3)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </Svg>
                </View>
                <Text style={[styles.nameText, { color: palette.muted }]}>Unidentified</Text>
                <Text style={styles.countText}>6 faces</Text>
                <View style={[styles.pill, { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: palette.border }]}><Text style={[styles.pillText, { color: palette.muted }]}>Review</Text></View>
              </GlassCard>
            </TouchableOpacity>

          </ScrollView>

        </View>

        <MockupBottomTabs activeTab="clusters" />
      </View>
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 60 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  backBtn: { width: 36, height: 36, backgroundColor: palette.glass2, borderWidth: 1, borderColor: palette.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: getFont('Syne', '800'), fontSize: 15, color: palette.silver2 },
  headerSub: { fontSize: 10, color: palette.muted, fontFamily: getFont('DMSans', '400') },

  filterRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  filterPill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1 },
  filterPillGhost: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, backgroundColor: palette.glass, borderColor: palette.border },
  filterPillGhostText: { color: palette.muted, fontSize: 11, fontFamily: getFont('DMSans', '400') },

  grid: { flex: 1 },
  gridCardPress: { width: '48.5%' },
  gridCard: { padding: 12, alignItems: 'center', height: 'auto' },
  avatarBox: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emojiText: { fontSize: 22 },
  nameText: { fontFamily: getFont('Syne', '700'), fontSize: 12, color: palette.silver2 },
  countText: { fontSize: 10, color: palette.muted, fontFamily: getFont('DMSans', '400'), marginVertical: 4 },
  
  pill: { paddingVertical: 2, paddingHorizontal: 7, borderRadius: 10, borderWidth: 1 },
  pillText: { fontSize: 9, fontFamily: getFont('DMSans', '500') }
});
