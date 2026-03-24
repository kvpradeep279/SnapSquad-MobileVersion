import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import AnimatedBackground from '../../components/AnimatedBackground';
import GradientButton from '../../components/GradientButton';
import { palette, getFont } from '../../theme';
import { RootStackParamList } from '../../types';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;

export default function UploadScreen() {
  const navigation = useNavigation<NavProp>();

  return (
    <AnimatedBackground>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <Path d="M10 3L5 8l5 5" stroke={palette.silver} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </Svg>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New album</Text>
        </View>

        <TouchableOpacity style={styles.dropZone}>
          <View style={styles.dropIcon}>
            <Svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <Path d="M11 4v10M7 8l4-4 4 4" stroke={palette.violet2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <Path d="M3 16h16" stroke={palette.violet2} strokeWidth="1.8" strokeLinecap="round"/>
            </Svg>
          </View>
          <Text style={styles.dropTitle}>Pick from gallery</Text>
          <Text style={styles.dropDesc}>JPEG, PNG, HEIC · max 50MB each</Text>
        </TouchableOpacity>

        <Text style={styles.selectedLabel}>Selected (6 photos)</Text>
        
        <View style={styles.grid}>
          {/* Mock Grid Items */}
          <LinearGradient colors={['rgba(123,92,245,0.3)', 'rgba(0,212,255,0.2)']} style={[styles.gridItem, { borderColor: palette.violet2, borderWidth: 2 }]}>
            <View style={styles.checkBadge}><Svg width="8" height="8" viewBox="0 0 8 8" fill="none"><Path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></Svg></View>
          </LinearGradient>
          <LinearGradient colors={['rgba(0,212,255,0.2)', 'rgba(77,235,160,0.15)']} style={[styles.gridItem, { borderColor: palette.violet2, borderWidth: 2 }]}>
            <View style={styles.checkBadge}><Svg width="8" height="8" viewBox="0 0 8 8" fill="none"><Path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></Svg></View>
          </LinearGradient>
          <LinearGradient colors={['rgba(77,235,160,0.15)', 'rgba(123,92,245,0.2)']} style={styles.gridItem} />
          <LinearGradient colors={['rgba(255,208,96,0.15)', 'rgba(0,212,255,0.1)']} style={styles.gridItem} />
          <LinearGradient colors={['rgba(123,92,245,0.2)', 'rgba(255,80,80,0.1)']} style={styles.gridItem} />
          <View style={[styles.gridItem, { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.15)', borderStyle: 'dashed', borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' }]}>
            <Svg width="18" height="18" viewBox="0 0 18 18" fill="none"><Path d="M9 3v12M3 9h12" stroke="rgba(200,208,224,0.4)" strokeWidth="1.8" strokeLinecap="round"/></Svg>
          </View>
        </View>

        <View style={styles.progressWrap}>
          <Text style={styles.progressLabel}>Upload progress</Text>
          <View style={styles.progressBarBg}>
            <LinearGradient colors={palette.gradient.hero} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.progressBarFill} />
          </View>
          <View style={styles.progressTextRow}>
            <Text style={styles.progressCount}>4 of 6 uploaded</Text>
            <Text style={styles.progressPercent}>66%</Text>
          </View>
        </View>

        <GradientButton title="Start clustering" onPress={() => navigation.navigate('Processing' as any)} />

      </View>
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 60 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  backBtn: { width: 36, height: 36, backgroundColor: palette.glass2, borderWidth: 1, borderColor: palette.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: getFont('Syne', '800'), fontSize: 16, color: palette.silver2 },

  dropZone: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(123,92,245,0.4)', borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 16, backgroundColor: 'rgba(123,92,245,0.04)' },
  dropIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(123,92,245,0.15)', borderWidth: 1, borderColor: 'rgba(123,92,245,0.3)', marginBottom: 10, alignItems: 'center', justifyContent: 'center' },
  dropTitle: { fontFamily: getFont('Syne', '700'), fontSize: 14, color: palette.silver2, marginBottom: 4 },
  dropDesc: { fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400') },

  selectedLabel: { fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400'), marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  gridItem: { width: '31%', aspectRatio: 1, borderRadius: 12, borderWidth: 1, borderColor: palette.border },
  checkBadge: { position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: 8, backgroundColor: palette.violet2, alignItems: 'center', justifyContent: 'center' },

  progressWrap: { marginBottom: 14 },
  progressLabel: { fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400'), marginBottom: 6 },
  progressBarBg: { height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { width: '66%', height: '100%', borderRadius: 2 },
  progressTextRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  progressCount: { fontSize: 10, color: palette.muted, fontFamily: getFont('DMSans', '400') },
  progressPercent: { fontSize: 10, color: palette.violet2, fontFamily: getFont('DMSans', '400') }
});
