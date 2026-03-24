/**
 * SSLogo — The Core SnapSquad Identity
 * 
 * High-fidelity, animated 3D metallic logo with twirling orbit rings.
 * Features a breathing pulse and a satisfying "crazy satisfying" motion when processing.
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Platform } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, G } from 'react-native-svg';
import { palette } from '../theme';

interface SSLogoProps {
  size?: number;
  isProcessing?: boolean;
}

const AnimatedSvg = Animated.createAnimatedComponent(Svg);
const AnimatedG = Animated.createAnimatedComponent(G);

export default function SSLogo({ size = 200, isProcessing = false }: SSLogoProps) {
  // Animation refs
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    // Continuous rotation for the "crazy satisfying motion"
    const spin = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: isProcessing ? 2500 : 12000,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: Platform.OS !== 'web',
      })
    );
    
    // Breathing pulse
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: isProcessing ? 1.05 : 1.02,
          duration: isProcessing ? 1000 : 3000,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulseAnim, {
          toValue: isProcessing ? 0.95 : 0.98,
          duration: isProcessing ? 1000 : 3000,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );

    // Dynamic glow
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.9,
          duration: 2000,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(glowAnim, {
          toValue: 0.4,
          duration: 2000,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );

    spin.start();
    pulse.start();
    glow.start();

    return () => {
      spin.stop();
      pulse.stop();
      glow.stop();
    };
  }, [isProcessing]);

  const spinInterpolation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const reverseSpinInterpolation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-360deg'],
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Background Bloom/Glow */}
      <Animated.View 
        style={[
          styles.glow, 
          { 
            width: size * 1.2, 
            height: size * 1.2, 
            borderRadius: size * 0.6,
            opacity: glowAnim,
            transform: [{ scale: pulseAnim }]
          }
        ]} 
      />

      <AnimatedSvg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        style={{ transform: [{ scale: pulseAnim }] }}
      >
        <Defs>
          <LinearGradient id="metallicGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
            <Stop offset="30%" stopColor="#3B9FDF" stopOpacity="1" />
            <Stop offset="70%" stopColor="#1B9FFF" stopOpacity="1" />
            <Stop offset="100%" stopColor="#0B3D6D" stopOpacity="1" />
          </LinearGradient>
          
          <LinearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#3B9FDF" stopOpacity="0.2" />
            <Stop offset="50%" stopColor="#7FBFFF" stopOpacity="1" />
            <Stop offset="100%" stopColor="#1B9FFF" stopOpacity="0.2" />
          </LinearGradient>
        </Defs>

        {/* Outer Ring Orbits */}
        {/* @ts-ignore: react-native-svg G does not type-support animated styles, but RN Animated processes it correctly at runtime */}
        <AnimatedG style={{ transform: [{ rotate: spinInterpolation }], originX: 100, originY: 100 } as any}>
          <Circle cx="100" cy="100" r="85" fill="none" stroke="url(#ringGrad)" strokeWidth="1" strokeDasharray="40 20" />
          <Circle cx="100" cy="100" r="70" fill="none" stroke="url(#ringGrad)" strokeWidth="0.5" strokeDasharray="10 30" />
        </AnimatedG>

        {/* @ts-ignore: react-native-svg G does not type-support animated styles, but RN Animated processes it correctly at runtime */}
        <AnimatedG style={{ transform: [{ rotate: reverseSpinInterpolation }], originX: 100, originY: 100 } as any}>
          <Circle cx="100" cy="100" r="78" fill="none" stroke="url(#ringGrad)" strokeWidth="1.5" strokeDasharray="60 30" opacity={0.6} />
        </AnimatedG>

        {/* Core SS Logo (Stylized Path) */}
        <G transform="translate(50, 50)">
          {/* S 1 */}
          <Path
            d="M30 20C30 10 40 5 50 5C65 5 70 15 70 25C70 45 30 40 30 65C30 75 35 85 50 85C65 85 70 75 70 70"
            fill="none"
            stroke="url(#metallicGrad)"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* S 2 Offset */}
          <Path
            d="M50 35C50 25 60 20 70 20C85 20 90 30 90 40C90 60 50 55 50 80C50 90 55 100 70 100C85 100 90 90 90 85"
            fill="none"
            stroke="url(#metallicGrad)"
            strokeWidth="12"
            strokeLinecap="round"
            opacity={0.8}
          />
        </G>
      </AnimatedSvg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    backgroundColor: 'rgba(59, 159, 223, 0.45)',
    ...Platform.select({
      web: { filter: 'blur(40px)' },
      ios: { shadowColor: '#3B9FDF', shadowOpacity: 1, shadowRadius: 40 },
      default: { shadowColor: '#3B9FDF', shadowOpacity: 0.8, shadowRadius: 30 },
    }),
  },
});
