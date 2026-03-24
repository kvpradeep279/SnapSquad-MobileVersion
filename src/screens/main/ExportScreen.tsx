import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import AnimatedBackground from '../../components/AnimatedBackground';
import GlassCard from '../../components/GlassCard';
import MockupBottomTabs from '../../components/MockupBottomTabs';
import { palette, getFont } from '../../theme';
import { RootStackParamList } from '../../types';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;

export default function ExportScreen() {
  const navigation = useNavigation<NavProp>();

  return (
    <AnimatedBackground>
      <View style={{ flex: 1 }}>
        <View style={styles.content}>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <Path d="M10 3L5 8l5 5" stroke={palette.silver} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </Svg>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Export</Text>
          </View>
          
          <Text style={styles.listLabel}>Select clusters to export</Text>

          <View style={styles.listWrap}>
            {/* Checked Item */}
            <GlassCard style={[styles.listItem, { borderColor: 'rgba(123,92,245,0.3)' }]}>
              <LinearGradient colors={['rgba(123,92,245,0.4)', 'rgba(0,212,255,0.3)']} style={styles.listAvatar}>
                <Text style={styles.avatarText}>👩</Text>
              </LinearGradient>
              <Text style={[styles.listName, { color: palette.silver2 }]}>Anjali · 14 photos</Text>
              <LinearGradient colors={palette.gradient.hero} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.checkBoxOn}>
                <Svg width="10" height="10" viewBox="0 0 10 10" fill="none"><Path d="M2 5l2.5 2.5 4-4" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></Svg>
              </LinearGradient>
            </GlassCard>

            {/* Checked Item */}
            <GlassCard style={[styles.listItem, { borderColor: 'rgba(0,212,255,0.3)' }]}>
              <LinearGradient colors={['rgba(0,212,255,0.3)', 'rgba(77,235,160,0.2)']} style={styles.listAvatar}>
                <Text style={styles.avatarText}>👨</Text>
              </LinearGradient>
              <Text style={[styles.listName, { color: palette.silver2 }]}>Rohan · 11 photos</Text>
              <LinearGradient colors={palette.gradient.hero} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.checkBoxOn}>
                <Svg width="10" height="10" viewBox="0 0 10 10" fill="none"><Path d="M2 5l2.5 2.5 4-4" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></Svg>
              </LinearGradient>
            </GlassCard>

            {/* Unchecked Item */}
            <GlassCard style={styles.listItem}>
              <View style={[styles.listAvatar, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
                <Text style={styles.avatarText}>👩</Text>
              </View>
              <Text style={[styles.listName, { color: palette.muted }]}>Priya · 9 photos</Text>
              <View style={styles.checkBoxOff} />
            </GlassCard>
          </View>

          <GlassCard style={styles.settingsCard}>
            <Text style={styles.settingsHeader}>Export settings</Text>
            
            <View style={styles.settingsRow}>
              <Text style={styles.settingsKey}>Format</Text>
              <Text style={styles.settingsVal}>JPEG · Original quality</Text>
            </View>

            <View style={[styles.settingsRow, { marginBottom: 0 }]}>
              <Text style={styles.settingsKey}>Include metadata</Text>
              <LinearGradient colors={palette.gradient.hero} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.toggleOn}>
                <View style={styles.toggleKnob} />
              </LinearGradient>
            </View>
          </GlassCard>

          <TouchableOpacity style={styles.mainBtn} onPress={() => navigation.navigate('Home' as any)}>
            <LinearGradient colors={palette.gradient.hero} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.mainBtnGrad}>
              <Svg width="16" height="16" viewBox="0 0 16 16" fill="none"><Path d="M8 2v8M4 10l4 4 4-4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></Svg>
              <Text style={styles.mainBtnText}>Download 25 photos</Text>
            </LinearGradient>
          </TouchableOpacity>

        </View>
        <MockupBottomTabs activeTab="export" />
      </View>
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 60 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  backBtn: { width: 36, height: 36, backgroundColor: palette.glass2, borderWidth: 1, borderColor: palette.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: getFont('Syne', '800'), fontSize: 16, color: palette.silver2 },

  listLabel: { fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400'), marginBottom: 8 },
  listWrap: { gap: 8, marginBottom: 16 },
  listItem: { paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  listAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16 },
  listName: { flex: 1, fontFamily: getFont('Syne', '700'), fontSize: 13 },
  checkBoxOn: { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  checkBoxOff: { width: 20, height: 20, borderRadius: 6, backgroundColor: palette.glass2, borderWidth: 1, borderColor: palette.border },

  settingsCard: { padding: 14, marginBottom: 14 },
  settingsHeader: { fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400'), marginBottom: 10 },
  settingsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  settingsKey: { fontSize: 12, color: palette.silver, fontFamily: getFont('DMSans', '400') },
  settingsVal: { fontSize: 12, color: palette.violet2, fontFamily: getFont('DMSans', '400') },
  toggleOn: { width: 34, height: 20, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 2, alignItems: 'flex-end' },
  toggleKnob: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff' },

  mainBtn: { borderRadius: 16, overflow: 'hidden' },
  mainBtnGrad: { paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  mainBtnText: { color: '#fff', fontFamily: getFont('Syne', '700'), fontSize: 15, letterSpacing: 0.3 }
});
