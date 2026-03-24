import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

import AnimatedBackground from '../../components/AnimatedBackground';
import GlassCard from '../../components/GlassCard';
import { palette, getFont } from '../../theme';
import { RootStackParamList } from '../../types';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function ProcessingScreen() {
  const navigation = useNavigation<NavProp>();
  const progressAnim = useRef(new Animated.Value(301.6)).current; // Circumference = 2 * PI * 48 = 301.59
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Dashoffset animation (from 301.6 to 90 representing 70%)
    Animated.timing(progressAnim, {
      toValue: 90,
      duration: 3000,
      useNativeDriver: true,
    }).start();

    // Infinite pulse for the "Clustering Running" dot
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.5, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();

    // Auto navigate to Results after 4 seconds to simulate completion
    const timer = setTimeout(() => {
      navigation.navigate('Clusters' as any);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatedBackground orbs={[ { color: 'rgba(0,212,255,0.1)', size: 200, top: 60, left: '50%' } ]}>
      <View style={styles.container}>
        
        <View style={styles.header}>
          <Text style={styles.title}>Processing album</Text>
          <Text style={styles.subtitle}>College reunion 2025</Text>
        </View>

        <View style={styles.circularWrap}>
          <Svg width="110" height="110" viewBox="0 0 110 110">
            <Defs>
              <SvgLinearGradient id="progGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor="#7B5CF5" />
                <Stop offset="100%" stopColor="#00D4FF" />
              </SvgLinearGradient>
            </Defs>
            <Circle cx="55" cy="55" r="48" stroke="rgba(255,255,255,0.06)" strokeWidth="8" fill="none" />
            <AnimatedCircle 
              cx="55" cy="55" r="48" 
              stroke="url(#progGrad)" 
              strokeWidth="8" 
              fill="none" 
              strokeDasharray="301.6" 
              strokeDashoffset={progressAnim} 
              strokeLinecap="round" 
              origin="55, 55"
              rotation="-90"
            />
          </Svg>
          <View style={styles.circularContent}>
            <Text style={styles.percentText}>70%</Text>
            <Text style={styles.percentLabel}>complete</Text>
          </View>
        </View>

        <View style={styles.list}>
          {/* Step 1 */}
          <GlassCard style={[styles.stepCard, { paddingVertical: 10 }]}>
            <View style={[styles.dot, { backgroundColor: palette.green }]} />
            <Text style={[styles.stepTitle, { color: palette.green }]}>Face detection</Text>
            <View style={[styles.pill, { backgroundColor: 'rgba(0,220,130,0.12)', borderColor: 'rgba(0,220,130,0.25)' }]}><Text style={[styles.pillText, { color: palette.green }]}>Done</Text></View>
          </GlassCard>
          
          {/* Step 2 */}
          <GlassCard style={[styles.stepCard, { paddingVertical: 10 }]}>
            <View style={[styles.dot, { backgroundColor: palette.green }]} />
            <Text style={[styles.stepTitle, { color: palette.green }]}>Embedding</Text>
            <View style={[styles.pill, { backgroundColor: 'rgba(0,220,130,0.12)', borderColor: 'rgba(0,220,130,0.25)' }]}><Text style={[styles.pillText, { color: palette.green }]}>Done</Text></View>
          </GlassCard>
          
          {/* Step 3 (Active) */}
          <GlassCard style={[styles.stepCard, { paddingVertical: 10, borderColor: 'rgba(0,212,255,0.3)' }]}>
            <Animated.View style={[styles.dot, { backgroundColor: palette.cyan2, opacity: pulseAnim }]} />
            <Text style={[styles.stepTitle, { color: palette.cyan2 }]}>Clustering</Text>
            <View style={[styles.pill, { backgroundColor: 'rgba(0,212,255,0.12)', borderColor: 'rgba(0,212,255,0.25)' }]}><Text style={[styles.pillText, { color: palette.cyan2 }]}>Running</Text></View>
          </GlassCard>
          
          {/* Step 4 */}
          <GlassCard style={[styles.stepCard, { paddingVertical: 10 }]}>
            <View style={[styles.dot, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
            <Text style={[styles.stepTitle, { color: palette.muted, fontWeight: '400' }]}>Validation</Text>
            <View style={[styles.pill, { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: palette.border }]}><Text style={[styles.pillText, { color: palette.muted }]}>Waiting</Text></View>
          </GlassCard>
          
          {/* Step 5 */}
          <GlassCard style={[styles.stepCard, { paddingVertical: 10 }]}>
            <View style={[styles.dot, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
            <Text style={[styles.stepTitle, { color: palette.muted, fontWeight: '400' }]}>Final output</Text>
            <View style={[styles.pill, { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: palette.border }]}><Text style={[styles.pillText, { color: palette.muted }]}>Waiting</Text></View>
          </GlassCard>
        </View>

        <Text style={styles.footerText}>Estimated time: ~45 seconds</Text>

      </View>
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 60, alignItems: 'center', justifyContent: 'space-between', paddingBottom: 40 },
  header: { alignItems: 'center', width: '100%' },
  title: { fontFamily: getFont('Syne', '800'), fontSize: 18, color: palette.silver2 },
  subtitle: { fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400'), marginTop: 4 },
  
  circularWrap: { width: 110, height: 110, position: 'relative', marginVertical: 20 },
  circularContent: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  percentText: { fontFamily: getFont('Syne', '800'), fontSize: 22, color: palette.silver2 },
  percentLabel: { fontSize: 9, color: palette.muted, fontFamily: getFont('DMSans', '400') },

  list: { width: '100%', gap: 8 },
  stepCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  stepTitle: { flex: 1, fontSize: 12, fontFamily: getFont('Syne', '600') },
  
  pill: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1 },
  pillText: { fontSize: 10, fontFamily: getFont('DMSans', '500') },
  
  footerText: { fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400') }
});
