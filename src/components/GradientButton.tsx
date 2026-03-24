/**
 * GradientButton — SnapSquad Mockup Version
 * 
 * Exact 1:1 match for .glass-btn in HTML mockup.
 */

import React from 'react';
import { 
  StyleSheet, 
  Text, 
  TouchableOpacity, 
  ActivityIndicator, 
  ViewStyle, 
  Platform 
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { palette, fontFamily } from '../theme';

interface GradientButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export default function GradientButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  style,
}: GradientButtonProps) {
  const isInactive = loading || disabled;

  // --grad: linear-gradient(135deg, #7B5CF5, #00D4FF);
  const colors = isInactive ? ['#2C3E50', '#0F1D35'] : palette.gradient.hero;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isInactive}
      activeOpacity={0.8}
      style={[styles.buttonWrapper, style]}
    >
      <LinearGradient
        colors={colors as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }} // 135deg equivalent
        style={styles.innerGradient}
      >
        {loading ? (
          <ActivityIndicator color={palette.white} />
        ) : (
          <Text style={styles.buttonText}>{title}</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  buttonWrapper: {
    borderRadius: 16, // From .glass-btn
    width: '100%',
    ...Platform.select({
      ios: {
        shadowColor: palette.violet,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  innerGradient: {
    borderRadius: 16,
    paddingVertical: 16, // From .glass-btn
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontFamily: fontFamily.syneBold, // 'Syne', 700
    fontSize: 15, // From mockup
    letterSpacing: 0.3,
  },
});
