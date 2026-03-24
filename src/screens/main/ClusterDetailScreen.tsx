import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import AnimatedBackground from '../../components/AnimatedBackground';
import { palette, getFont } from '../../theme';
import { RootStackParamList } from '../../types';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;

export default function ClusterDetailScreen() {
  const navigation = useNavigation<NavProp>();

  return (
    <AnimatedBackground orbs={[ { color: 'rgba(123,92,245,0.14)', size: 160, top: 60, right: -40 } ]}>
      <View style={styles.container}>
        
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <Path d="M10 3L5 8l5 5" stroke={palette.silver} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </Svg>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Cluster detail</Text>
        </View>

        <View style={styles.profileRow}>
          <LinearGradient colors={['rgba(123,92,245,0.5)', 'rgba(0,212,255,0.4)']} style={styles.avatar}>
            <Text style={styles.avatarText}>👩</Text>
          </LinearGradient>
          <View>
            <Text style={styles.nameText}>Anjali</Text>
            <View style={styles.pillRow}>
              <View style={[styles.pill, { backgroundColor: 'rgba(0,220,130,0.12)', borderColor: 'rgba(0,220,130,0.25)' }]}>
                <Text style={styles.pillText}>97% confidence</Text>
              </View>
              <Text style={styles.countText}>14 photos</Text>
            </View>
          </View>
        </View>

        <View style={styles.grid}>
          <LinearGradient colors={['rgba(123,92,245,0.35)', 'rgba(0,212,255,0.25)']} style={[styles.gridCell, { borderColor: palette.violet2 }]} />
          <LinearGradient colors={['rgba(0,212,255,0.25)', 'rgba(77,235,160,0.2)']} style={styles.gridCell} />
          <LinearGradient colors={['rgba(77,235,160,0.2)', 'rgba(255,208,96,0.15)']} style={styles.gridCell} />
          <LinearGradient colors={['rgba(255,208,96,0.2)', 'rgba(123,92,245,0.2)']} style={styles.gridCell} />
          <LinearGradient colors={['rgba(123,92,245,0.2)', 'rgba(255,80,80,0.15)']} style={styles.gridCell} />
          <LinearGradient colors={['rgba(0,212,255,0.2)', 'rgba(123,92,245,0.25)']} style={styles.gridCell} />
          <LinearGradient colors={['rgba(77,235,160,0.15)', 'rgba(0,212,255,0.2)']} style={styles.gridCell} />
          
          <View style={[styles.gridCell, { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.12)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontSize: 9, color: palette.muted, fontFamily: getFont('DMSans', '400') }}>+6</Text>
          </View>
        </View>

        <View style={styles.actionsBox}>
          <TouchableOpacity style={styles.ghostBtn}>
            <Svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <Path d="M2 7.5h11M8.5 3l4 4.5-4 4.5" stroke={palette.silver} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </Svg>
            <Text style={styles.ghostText}>Rename person</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.ghostBtn}>
            <Svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <Circle cx="4" cy="7.5" r="3" stroke={palette.silver} strokeWidth="1.3"/>
              <Circle cx="11" cy="7.5" r="3" stroke={palette.silver} strokeWidth="1.3"/>
              <Path d="M7 7.5h1" stroke={palette.silver} strokeWidth="1.3" strokeLinecap="round"/>
            </Svg>
            <Text style={styles.ghostText}>Merge clusters</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.ghostBtn, { borderColor: 'rgba(255,80,80,0.2)' }]}>
            <Svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <Path d="M2 7.5h11M7 3l-4 4.5L7 12" stroke="rgba(255,112,112,0.8)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </Svg>
            <Text style={[styles.ghostText, { color: 'rgba(255,112,112,0.8)' }]}>Eject face / move to unidentified</Text>
          </TouchableOpacity>
        </View>

      </View>
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 60 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  backBtn: { width: 36, height: 36, backgroundColor: palette.glass2, borderWidth: 1, borderColor: palette.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: getFont('Syne', '800'), fontSize: 15, color: palette.silver2 },

  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  avatar: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: palette.violet2, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 28 },
  nameText: { fontFamily: getFont('Syne', '800'), fontSize: 20, color: palette.silver2 },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  pill: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1 },
  pillText: { fontSize: 10, color: palette.green, fontFamily: getFont('DMSans', '500') },
  countText: { fontSize: 10, color: palette.muted, fontFamily: getFont('DMSans', '400') },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 14 },
  gridCell: { width: '23.8%', aspectRatio: 1, borderRadius: 10, borderWidth: 1, borderColor: palette.border },

  actionsBox: { gap: 7 },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: palette.glass2, borderWidth: 1, borderColor: palette.border2, borderRadius: 16, paddingVertical: 11 },
  ghostText: { fontSize: 13, color: palette.silver, fontFamily: getFont('DMSans', '500') },
});
