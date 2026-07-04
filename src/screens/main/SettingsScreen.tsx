import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import AnimatedBackground from '../../components/AnimatedBackground';
import GlassCard from '../../components/GlassCard';
import MockupBottomTabs from '../../components/MockupBottomTabs';
import { useAuth } from '../../context/AuthContext';
import { palette, getFont } from '../../theme';
import { RootStackParamList } from '../../types';
import api from '../../services/api';
import ProfileSetupModal from '../../components/ProfileSetupModal';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Settings'>;

export default function SettingsScreen() {
  const navigation = useNavigation<NavProp>();
  const { signOut, user } = useAuth();

  // Derive avatar letter and display name from real user data
  const avatarLetter = (user?.username?.[0] || user?.email?.[0] || '?').toUpperCase();
  const displayName = user?.username || user?.email?.split('@')[0] || 'User';
  const displayEmail = user?.email || '';

  const [isProfileModalOpen, setIsProfileModalOpen] = React.useState(false);

  const handleSignOut = () => {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => signOut(),
        },
      ]
    );
  };

  const handleDeleteAllData = () => {
    Alert.alert(
      'Delete all data',
      'This will permanently delete all your albums, photos, and face clusters. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete('/auth/me/data');
              Alert.alert('Done', 'All your data has been deleted.');
              signOut();
            } catch {
              Alert.alert('Error', 'Failed to delete data. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleFaceDataControls = () => {
    Alert.alert(
      'Face data controls',
      'Your face embeddings are stored encrypted on the server and never shared. You can delete them by deleting all data.',
      [{ text: 'OK' }]
    );
  };

  return (
    <AnimatedBackground>
      <View style={{ flex: 1 }}>
        <View style={styles.content}>

          {/* Profile box — real user data */}
          <View style={styles.profileBox}>
            <LinearGradient colors={palette.gradient.hero} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.avatar}>
              <Text style={styles.avatarText}>{avatarLetter}</Text>
            </LinearGradient>
            <View>
              <Text style={styles.nameText}>{displayName}</Text>
              <Text style={styles.emailText}>{displayEmail}</Text>
            </View>
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

            {/* Account */}
            <Text style={styles.sectionHeader}>Account</Text>
            <TouchableOpacity onPress={() => navigation.navigate('EditProfile')}>
              <GlassCard style={styles.settingCard}>
                <Text style={styles.settingText}>Edit profile</Text>
                <Svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <Path d="M5 3l4 4-4 4" stroke="rgba(200,208,224,0.4)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </Svg>
              </GlassCard>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setIsProfileModalOpen(true)}>
              <GlassCard style={styles.settingCard}>
                <Text style={styles.settingText}>Update Auto-ID face</Text>
                <Svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <Path d="M5 3l4 4-4 4" stroke="rgba(200,208,224,0.4)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </Svg>
              </GlassCard>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => Alert.alert('Notifications', 'Notification settings coming in a future update.')}>
              <GlassCard style={styles.settingCard}>
                <Text style={styles.settingText}>Notifications</Text>
                <Svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <Path d="M5 3l4 4-4 4" stroke="rgba(200,208,224,0.4)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </Svg>
              </GlassCard>
            </TouchableOpacity>

            {/* Privacy */}
            <Text style={[styles.sectionHeader, { marginTop: 8 }]}>Privacy</Text>
            <TouchableOpacity onPress={handleFaceDataControls}>
              <GlassCard style={styles.settingCard}>
                <Text style={styles.settingText}>Face data controls</Text>
                <Svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <Path d="M5 3l4 4-4 4" stroke="rgba(200,208,224,0.4)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </Svg>
              </GlassCard>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleDeleteAllData}>
              <GlassCard style={styles.settingCard}>
                <Text style={[styles.settingText, { color: 'rgba(255,100,100,0.8)' }]}>Delete all data</Text>
                <Svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <Path d="M5 3l4 4-4 4" stroke="rgba(255,100,100,0.5)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </Svg>
              </GlassCard>
            </TouchableOpacity>

            {/* Sign Out */}
            <TouchableOpacity
              style={styles.signOutBtn}
              onPress={handleSignOut}
            >
              <Text style={styles.signOutText}>Sign out</Text>
            </TouchableOpacity>

          </ScrollView>

        </View>
        <MockupBottomTabs activeTab="settings" />
      </View>

      <ProfileSetupModal 
        visible={isProfileModalOpen}
        onComplete={() => {
          setIsProfileModalOpen(false);
          Alert.alert('Success', 'Your Auto-ID face has been updated!');
        }}
        onSkip={() => setIsProfileModalOpen(false)}
      />
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 60 },

  profileBox: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 32 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: getFont('Syne', '700'), fontSize: 20, color: '#fff' },
  nameText: { fontFamily: getFont('Syne', '700'), fontSize: 18, color: palette.silver2, letterSpacing: -0.2 },
  emailText: { fontSize: 12, color: palette.muted, fontFamily: getFont('DMSans', '400'), marginTop: 2 },

  sectionHeader: { fontSize: 11, color: palette.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8, fontFamily: getFont('DMSans', '500') },
  settingCard: { paddingVertical: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  settingText: { fontSize: 14, color: palette.silver, fontFamily: getFont('DMSans', '500') },

  signOutBtn: { alignItems: 'center', justifyContent: 'center', backgroundColor: palette.glass2, borderWidth: 1, borderColor: 'rgba(255,80,80,0.2)', borderRadius: 16, paddingVertical: 12, marginTop: 8, marginBottom: 16 },
  signOutText: { fontSize: 13, color: 'rgba(255,100,100,0.8)', fontFamily: getFont('DMSans', '500') }
});
