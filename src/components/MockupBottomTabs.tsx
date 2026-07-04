import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, getFont } from '../theme';
import { RootStackParamList } from '../types';

interface TabProps {
  activeTab: 'home' | 'albums' | 'upload' | 'rooms' | 'people';
}

export default function MockupBottomTabs({ activeTab }: TabProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const getStyle = (tab: string) => ({
    color: activeTab === tab ? palette.violet2 : palette.muted
  });

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 20) }]}>
      {/* HOME */}
      <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('Home' as any)}>
        <View style={[styles.tabIcon, activeTab === 'home' && styles.activeTabIcon]}>
          <Svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <Path d="M3 10L10 3l7 7v7H13v-4H7v4H3z" stroke={activeTab === 'home' ? palette.violet2 : palette.muted} strokeWidth="1.4" strokeLinejoin="round"/>
          </Svg>
        </View>
        <Text style={[styles.tabLabel, getStyle('home')]}>Home</Text>
      </TouchableOpacity>

      {/* ALBUMS */}
      <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('Clusters' as any)}>
        <View style={[styles.tabIcon, activeTab === 'albums' && styles.activeTabIcon]}>
          <Svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <Rect x="2" y="2" width="7" height="7" rx="2" stroke={activeTab === 'albums' ? palette.violet2 : palette.muted} strokeWidth="1.3"/>
            <Rect x="11" y="2" width="7" height="7" rx="2" stroke={activeTab === 'albums' ? palette.violet2 : palette.muted} strokeWidth="1.3"/>
            <Rect x="2" y="11" width="7" height="7" rx="2" stroke={activeTab === 'albums' ? palette.violet2 : palette.muted} strokeWidth="1.3"/>
            <Rect x="11" y="11" width="7" height="7" rx="2" stroke={activeTab === 'albums' ? palette.violet2 : palette.muted} strokeWidth="1.3"/>
          </Svg>
        </View>
        <Text style={[styles.tabLabel, getStyle('albums')]}>Albums</Text>
      </TouchableOpacity>

      {/* UPLOAD */}
      <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('UploadHub' as any)}>
        {activeTab === 'upload' ? (
          <LinearGradient
            colors={palette.gradient.hero}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.uploadIconWrap}
          >
            <Svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <Path d="M8 2v8M4 6l4-4 4 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <Path d="M2 12h12" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
            </Svg>
          </LinearGradient>
        ) : (
          <View style={[styles.uploadIconWrap, { backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.border }]}>
            <Svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <Path d="M8 2v8M4 6l4-4 4 4" stroke={palette.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <Path d="M2 12h12" stroke={palette.muted} strokeWidth="1.8" strokeLinecap="round"/>
            </Svg>
          </View>
        )}
        <Text style={[styles.tabLabel, getStyle('upload')]}>Upload</Text>
      </TouchableOpacity>

      {/* ROOMS */}
      <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('Rooms' as any)}>
        <View style={[styles.tabIcon, activeTab === 'rooms' && styles.activeTabIcon]}>
          <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <Path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke={activeTab === 'rooms' ? palette.violet2 : palette.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <Circle cx="9" cy="7" r="4" stroke={activeTab === 'rooms' ? palette.violet2 : palette.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <Path d="M23 21v-2a4 4 0 00-3-3.87" stroke={activeTab === 'rooms' ? palette.violet2 : palette.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <Path d="M16 3.13a4 4 0 010 7.75" stroke={activeTab === 'rooms' ? palette.violet2 : palette.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </Svg>
        </View>
        <Text style={[styles.tabLabel, getStyle('rooms')]}>Rooms</Text>
      </TouchableOpacity>

      {/* PEOPLE */}
      <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('People' as any)}>
        <View style={[styles.tabIcon, activeTab === 'people' && styles.activeTabIcon]}>
          <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <Path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke={activeTab === 'people' ? palette.violet2 : palette.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <Circle cx="12" cy="7" r="4" stroke={activeTab === 'people' ? palette.violet2 : palette.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </Svg>
        </View>
        <Text style={[styles.tabLabel, getStyle('people')]}>People</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: 'rgba(7,17,31,0.95)',
    borderTopWidth: 1,
    borderTopColor: palette.border,
    paddingTop: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  tabIcon: {
    width: 32, height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  activeTabIcon: {
    backgroundColor: 'rgba(123,92,245,0.15)',
  },
  tabLabel: {
    fontFamily: getFont('DMSans', '400'),
    fontSize: 10,
  },
  uploadIconWrap: {
    width: 32, height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  }
});
