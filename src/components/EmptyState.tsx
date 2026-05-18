import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import GlassCard from './GlassCard';
import { palette, getFont } from '../theme';

interface EmptyStateProps {
  iconType: 'album' | 'people' | 'cluster';
  title: string;
  subtitle: string;
}

export default function EmptyState({ iconType, title, subtitle }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <GlassCard style={styles.card}>
        <LinearGradient 
          colors={['rgba(123,92,245,0.2)', 'rgba(0,212,255,0.1)']} 
          style={styles.iconBox}
        >
          {iconType === 'album' && (
            <Svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <Path d="M4 4h6l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" stroke={palette.violet2} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <Path d="M12 11v4M10 13h4" stroke={palette.violet2} strokeWidth="1.5" strokeLinecap="round"/>
            </Svg>
          )}
          {iconType === 'people' && (
            <Svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <Path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke={palette.violet2} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <Circle cx="9" cy="7" r="4" stroke={palette.violet2} strokeWidth="1.5"/>
              <Path d="M23 21v-2a4 4 0 00-3-3.87m-4-12a4 4 0 010 7.75" stroke={palette.violet2} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </Svg>
          )}
          {iconType === 'cluster' && (
            <Svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <Circle cx="12" cy="12" r="10" stroke={palette.violet2} strokeWidth="1.5"/>
              <Path d="M8 14s1.5 2 4 2 4-2 4-2" stroke={palette.violet2} strokeWidth="1.5" strokeLinecap="round"/>
              <Path d="M9 9h.01M15 9h.01" stroke={palette.violet2} strokeWidth="2" strokeLinecap="round"/>
            </Svg>
          )}
        </LinearGradient>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    width: '100%',
  },
  card: {
    padding: 32,
    alignItems: 'center',
    width: '100%',
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(123,92,245,0.3)',
  },
  title: {
    fontFamily: getFont('Syne', '700'),
    fontSize: 18,
    color: palette.silver2,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: getFont('DMSans', '400'),
    fontSize: 13,
    color: palette.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
