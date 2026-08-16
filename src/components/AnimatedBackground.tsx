/**
 * AnimatedBackground — Plexida Mockup Version
 * 
 * Recreates the deep `.stage` / `.phone` background from the HTML mockup:
 * Base: #050D18 / #07111F
 * Orbs: Absolute positioned, heavily blurred (filter: blur(60px))
 * 
 * Includes subtle floating animation.
 */

import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Animated, Easing, Platform, ViewStyle } from 'react-native';
import { palette } from '../theme';

export interface OrbConfig {
  color: string;
  size: number;
  top?: number | string;
  left?: number | string;
  right?: number | string;
  bottom?: number | string;
}

interface AnimatedBackgroundProps {
  children?: React.ReactNode;
  orbs?: OrbConfig[];
}

export default function AnimatedBackground({ children, orbs = [] }: AnimatedBackgroundProps) {
  return (
    <View style={styles.container}>
      {/* Renders the specific orbs requested by the screen */}
      {orbs.map((orb, index) => (
        <FloatingOrb key={index} orb={orb} index={index} />
      ))}
      {children}
    </View>
  );
}

function FloatingOrb({ orb, index }: { orb: OrbConfig, index: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Subtle float animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 15000 + (index * 3000), // Offset duration slightly based on index
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 15000 + (index * 3000),
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    ).start();
  }, [anim, index]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 20] // Gentle 20px float
  });
  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.05]
  });

  const positionStyles: ViewStyle = {};
  if (orb.top !== undefined) positionStyles.top = orb.top as any;
  if (orb.left !== undefined) positionStyles.left = orb.left as any;
  if (orb.right !== undefined) positionStyles.right = orb.right as any;
  if (orb.bottom !== undefined) positionStyles.bottom = orb.bottom as any;

  return (
    <Animated.View
      style={[
        positionStyles,
        {
          position: 'absolute',
          width: orb.size,
          height: orb.size,
          borderRadius: orb.size / 2,
          backgroundColor: orb.color,
          transform: [{ translateY }, { scale }],
          // Using Blur radius (React Native view opacity workaround for large blurred shapes)
          ...Platform.select({
            web: { filter: 'blur(60px)' },
            ios: { shadowColor: orb.color, shadowOpacity: 1, shadowRadius: 60, shadowOffset: { width: 0, height: 0 } },
            android: { elevation: 0 } // Android doesn't do deep shadow blur easily without external libs, so we rely on exact mockup RGBA backgrounds being partially transparent themselves
          }),
        } as any
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background, // Match stage #050D18
  },
});
