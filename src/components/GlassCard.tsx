/**
 * GlassCard — SnapSquad Mockup Version
 * 
 * Exact 1:1 match for .glass-card in HTML mockup.
 */

import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp, Platform } from 'react-native';
import { palette, borderRadius, spacing } from '../theme';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function GlassCard({ children, style }: GlassCardProps) {
  return (
    <View style={[styles.card, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.glass, // rgba(255,255,255,0.06)
    borderColor: palette.border,    // rgba(255,255,255,0.10)
    borderWidth: 1,
    borderRadius: 20, // Strict 20px from mockup
    padding: spacing.md, 
    ...Platform.select({
      web: { backdropFilter: 'blur(12px)' as any },
      ios: { // Fallbacks for native
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
      },
    }),
  },
});
