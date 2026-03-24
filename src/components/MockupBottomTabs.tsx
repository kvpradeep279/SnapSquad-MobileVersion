import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import { palette, getFont } from '../theme';
import { RootStackParamList } from '../types';

interface TabProps {
  activeTab: 'home' | 'clusters' | 'upload' | 'export' | 'settings';
}

export default function MockupBottomTabs({ activeTab }: TabProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const getStyle = (tab: string) => ({
    color: activeTab === tab ? palette.violet2 : palette.muted
  });

  return (
    <View style={styles.container}>
      {/* HOME */}
      <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('Home' as any)}>
        <View style={styles.tabIcon}>
          <Svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <Path d="M3 10L10 3l7 7v7H13v-4H7v4H3z" stroke={activeTab === 'home' ? palette.violet2 : palette.muted} strokeWidth="1.4" strokeLinejoin="round"/>
          </Svg>
        </View>
        <Text style={[styles.tabLabel, getStyle('home')]}>Home</Text>
      </TouchableOpacity>

      {/* CLUSTERS (Results) */}
      <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('Clusters' as any)}>
        <View style={styles.tabIcon}>
          <Svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <Rect x="2" y="2" width="7" height="7" rx="2" stroke={activeTab === 'clusters' ? palette.violet2 : palette.muted} strokeWidth="1.3"/>
            <Rect x="11" y="2" width="7" height="7" rx="2" stroke={activeTab === 'clusters' ? palette.violet2 : palette.muted} strokeWidth="1.3"/>
            <Rect x="2" y="11" width="7" height="7" rx="2" stroke={activeTab === 'clusters' ? palette.violet2 : palette.muted} strokeWidth="1.3"/>
            <Rect x="11" y="11" width="7" height="7" rx="2" stroke={activeTab === 'clusters' ? palette.violet2 : palette.muted} strokeWidth="1.3"/>
          </Svg>
        </View>
        <Text style={[styles.tabLabel, getStyle('clusters')]}>Clusters</Text>
      </TouchableOpacity>

      {/* UPLOAD (Center Button) */}
      <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('Upload' as any)}>
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
        <Text style={[styles.tabLabel, getStyle('upload')]}>Upload</Text>
      </TouchableOpacity>

      {/* EXPORT */}
      <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('Export' as any)}>
        <View style={styles.tabIcon}>
          <Svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <Path d="M14 8l3 3-3 3M6 8l-3 3 3 3M11 4l-2 12" stroke={activeTab === 'export' ? palette.violet2 : palette.muted} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </Svg>
        </View>
        <Text style={[styles.tabLabel, getStyle('export')]}>Export</Text>
      </TouchableOpacity>

      {/* SETTINGS */}
      <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate('Settings' as any)}>
        <View style={styles.tabIcon}>
          <Svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <Circle cx="10" cy="10" r="2.5" stroke={activeTab === 'settings' ? palette.violet2 : palette.muted} strokeWidth="1.3"/>
            <Path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.41 1.41M14.36 14.36l1.41 1.41M4.22 15.78l1.41-1.41M14.36 5.64l1.41-1.41" stroke={activeTab === 'settings' ? palette.violet2 : palette.muted} strokeWidth="1.3" strokeLinecap="round"/>
          </Svg>
        </View>
        <Text style={[styles.tabLabel, getStyle('settings')]}>Settings</Text>
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
    paddingBottom: 20,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  tabIcon: {
    width: 22, height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontFamily: getFont('DMSans', '400'),
    fontSize: 10,
  },
  uploadIconWrap: {
    width: 36, height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -8,
  }
});
