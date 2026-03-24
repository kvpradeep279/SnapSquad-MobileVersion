import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
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

export default function SettingsScreen() {
  const navigation = useNavigation<NavProp>();

  return (
    <AnimatedBackground>
      <View style={{ flex: 1 }}>
        <View style={styles.content}>
          
          <View style={styles.profileBox}>
            <LinearGradient colors={palette.gradient.hero} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.avatar}>
              <Text style={styles.avatarText}>P</Text>
            </LinearGradient>
            <View>
              <Text style={styles.nameText}>Pradeep Singh</Text>
              <Text style={styles.emailText}>pradeep@example.com</Text>
            </View>
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {/* Account */}
            <Text style={styles.sectionHeader}>Account</Text>
            <GlassCard style={styles.settingCard}>
              <Text style={styles.settingText}>Edit profile</Text>
              <Svg width="14" height="14" viewBox="0 0 14 14" fill="none"><Path d="M5 3l4 4-4 4" stroke="rgba(200,208,224,0.4)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></Svg>
            </GlassCard>
            <GlassCard style={styles.settingCard}>
              <Text style={styles.settingText}>Notifications</Text>
              <Svg width="14" height="14" viewBox="0 0 14 14" fill="none"><Path d="M5 3l4 4-4 4" stroke="rgba(200,208,224,0.4)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></Svg>
            </GlassCard>

            {/* Preferences */}
            <Text style={[styles.sectionHeader, { marginTop: 8 }]}>Preferences</Text>
            <GlassCard style={styles.settingCard}>
              <Text style={styles.settingText}>Dark mode</Text>
              <LinearGradient colors={palette.gradient.hero} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.toggleOn}>
                <View style={styles.toggleKnob} />
              </LinearGradient>
            </GlassCard>
            <GlassCard style={styles.settingCard}>
              <View>
                <Text style={styles.settingText}>Storage used</Text>
                <Text style={styles.storageSubText}>1.2 GB of 5 GB</Text>
              </View>
              <Text style={styles.manageText}>Manage</Text>
            </GlassCard>

            {/* Privacy */}
            <Text style={[styles.sectionHeader, { marginTop: 8 }]}>Privacy</Text>
            <GlassCard style={styles.settingCard}>
              <Text style={styles.settingText}>Face data controls</Text>
              <Svg width="14" height="14" viewBox="0 0 14 14" fill="none"><Path d="M5 3l4 4-4 4" stroke="rgba(200,208,224,0.4)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></Svg>
            </GlassCard>
            <GlassCard style={styles.settingCard}>
              <Text style={styles.settingText}>Delete all data</Text>
              <Svg width="14" height="14" viewBox="0 0 14 14" fill="none"><Path d="M5 3l4 4-4 4" stroke="rgba(255,100,100,0.5)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></Svg>
            </GlassCard>

            {/* Sign Out */}
            <TouchableOpacity 
              style={styles.signOutBtn}
              onPress={() => navigation.navigate('Auth' as any)}
            >
              <Text style={styles.signOutText}>Sign out</Text>
            </TouchableOpacity>

          </ScrollView>

        </View>
        <MockupBottomTabs activeTab="settings" />
      </View>
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 60 },
  
  profileBox: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: getFont('Syne', '800'), fontSize: 18, color: '#fff' },
  nameText: { fontFamily: getFont('Syne', '800'), fontSize: 16, color: palette.silver2 },
  emailText: { fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400') },

  sectionHeader: { fontSize: 10, color: palette.muted, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 },
  settingCard: { paddingVertical: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  settingText: { fontSize: 13, color: palette.silver, fontFamily: getFont('DMSans', '400') },
  storageSubText: { fontSize: 10, color: palette.muted, fontFamily: getFont('DMSans', '400'), marginTop: 2 },
  manageText: { fontSize: 12, color: palette.violet2, fontFamily: getFont('DMSans', '400') },
  
  toggleOn: { width: 34, height: 20, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 2, alignItems: 'flex-end' },
  toggleKnob: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff' },

  signOutBtn: { alignItems: 'center', justifyContent: 'center', backgroundColor: palette.glass2, borderWidth: 1, borderColor: 'rgba(255,80,80,0.2)', borderRadius: 16, paddingVertical: 12, marginTop: 8 },
  signOutText: { fontSize: 13, color: 'rgba(255,100,100,0.8)', fontFamily: getFont('DMSans', '500') }
});
