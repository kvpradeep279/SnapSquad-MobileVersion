import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import AnimatedBackground from '../../components/AnimatedBackground';
import GlassCard from '../../components/GlassCard';
import MockupBottomTabs from '../../components/MockupBottomTabs';
import { palette, getFont } from '../../theme';
import { RootStackParamList } from '../../types';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();

  const renderPill = (text: string, type: 'green' | 'amber' | 'violet' | 'red') => {
    let color, bg, border;
    if(type === 'green') { color = '#4DEBA0'; bg = 'rgba(0,220,130,0.12)'; border = 'rgba(0,220,130,0.25)' }
    else if(type === 'amber') { color = '#FFD060'; bg = 'rgba(255,180,0,0.12)'; border = 'rgba(255,180,0,0.25)' }
    else if(type === 'violet') { color = palette.violet2; bg = 'rgba(123,92,245,0.18)'; border = 'rgba(123,92,245,0.3)' }
    else { color = '#FF7070'; bg = 'rgba(255,80,80,0.12)'; border = 'rgba(255,80,80,0.25)' }

    return (
      <View style={[styles.pill, { backgroundColor: bg, borderColor: border }]}>
        <Text style={[styles.pillText, { color }]}>{text}</Text>
      </View>
    );
  };

  return (
    <AnimatedBackground
      orbs={[ { color: 'rgba(123,92,245,0.12)', size: 180, top: -20, right: -30 } ]}
    >
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View>
              <Text style={styles.greetingText}>Good morning</Text>
              <Text style={styles.nameText}>Hey, Pradeep 👋</Text>
            </View>
            <LinearGradient
              colors={palette.gradient.hero}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.avatar}
            >
              <Text style={styles.avatarText}>P</Text>
            </LinearGradient>
          </View>

          <TouchableOpacity style={styles.createBtn} onPress={() => navigation.navigate('Upload' as any)}>
            <LinearGradient colors={palette.gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.createBtnGradient}>
              <Svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <Circle cx="9" cy="9" r="8" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2"/>
                <Path d="M9 5v8M5 9h8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
              </Svg>
              <Text style={styles.createBtnText}>Create album cluster</Text>
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Recent albums</Text>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            
            {/* Item 1 */}
            <TouchableOpacity onPress={() => navigation.navigate('Clusters' as any)}>
              <GlassCard style={styles.albumCard}>
                <LinearGradient colors={['rgba(123,92,245,0.3)', 'rgba(0,212,255,0.2)']} style={styles.albumIconBox}>
                  <Svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <Rect x="2" y="5" width="16" height="12" rx="2" stroke="rgba(200,208,224,0.6)" strokeWidth="1.2"/>
                    <Circle cx="7" cy="3" r="1" fill="rgba(200,208,224,0.4)"/>
                    <Circle cx="13" cy="3" r="1" fill="rgba(200,208,224,0.4)"/>
                  </Svg>
                </LinearGradient>
                <View style={styles.albumInfo}>
                  <Text style={styles.albumTitle}>College reunion 2025</Text>
                  <Text style={styles.albumDesc}>47 photos · 8 people</Text>
                </View>
                {renderPill('Done', 'green')}
              </GlassCard>
            </TouchableOpacity>

            {/* Item 2 */}
            <GlassCard style={styles.albumCard}>
              <LinearGradient colors={['rgba(0,212,255,0.2)', 'rgba(77,235,160,0.15)']} style={styles.albumIconBox}>
                <Svg width="20" height="20" viewBox="0 0 20 20" fill="none"><Rect x="2" y="5" width="16" height="12" rx="2" stroke="rgba(200,208,224,0.6)" strokeWidth="1.2"/></Svg>
              </LinearGradient>
              <View style={styles.albumInfo}>
                <Text style={styles.albumTitle}>Goa trip photos</Text>
                <Text style={styles.albumDesc}>120 photos · clustering...</Text>
              </View>
              {renderPill('Processing', 'amber')}
            </GlassCard>

            {/* Item 3 */}
            <GlassCard style={styles.albumCard}>
              <LinearGradient colors={['rgba(255,208,96,0.15)', 'rgba(255,100,100,0.1)']} style={styles.albumIconBox}>
                <Svg width="20" height="20" viewBox="0 0 20 20" fill="none"><Rect x="2" y="5" width="16" height="12" rx="2" stroke="rgba(200,208,224,0.6)" strokeWidth="1.2"/></Svg>
              </LinearGradient>
              <View style={styles.albumInfo}>
                <Text style={styles.albumTitle}>Birthday bash</Text>
                <Text style={styles.albumDesc}>23 photos · queued</Text>
              </View>
              {renderPill('Queued', 'violet')}
            </GlassCard>

            {/* Item 4 */}
            <GlassCard style={styles.albumCard}>
              <View style={[styles.albumIconBox, { backgroundColor: 'rgba(255,80,80,0.1)', borderColor: 'rgba(255,80,80,0.2)', borderWidth: 1 }]}>
                <Svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <Path d="M9 5v5M9 13h.01" stroke="#FF7070" strokeWidth="1.6" strokeLinecap="round"/>
                  <Circle cx="9" cy="9" r="8" stroke="#FF7070" strokeWidth="1.2"/>
                </Svg>
              </View>
              <View style={styles.albumInfo}>
                <Text style={styles.albumTitle}>Office party</Text>
                <Text style={styles.albumDesc}>Unsupported format</Text>
              </View>
              {renderPill('Failed', 'red')}
            </GlassCard>

          </ScrollView>
        </View>

        <MockupBottomTabs activeTab="home" />
      </View>
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  greetingText: { fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400') },
  nameText: { fontFamily: getFont('Syne', '800'), fontSize: 18, color: palette.silver2 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: getFont('Syne', '800'), fontSize: 14, color: '#fff' },
  
  createBtn: { marginBottom: 18, borderRadius: 16, overflow: 'hidden' },
  createBtnGradient: { paddingVertical: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  createBtnText: { color: '#fff', fontFamily: getFont('Syne', '700'), fontSize: 15, letterSpacing: 0.3 },

  sectionTitle: { fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400'), marginBottom: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  list: { flex: 1 },

  albumCard: { padding: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  albumIconBox: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: palette.border2, alignItems: 'center', justifyContent: 'center' },
  albumInfo: { flex: 1 },
  albumTitle: { fontFamily: getFont('Syne', '700'), fontSize: 13, color: palette.silver2 },
  albumDesc: { fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400'), marginTop: 2 },
  
  pill: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: 10, fontFamily: getFont('DMSans', '500') }
});
