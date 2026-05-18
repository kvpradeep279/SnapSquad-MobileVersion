import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

import AnimatedBackground from '../../components/AnimatedBackground';
import GlassCard from '../../components/GlassCard';
import { getAlbumStatus } from '../../services/albums';
import { useAlbums } from '../../context/AlbumContext';
import { palette, getFont } from '../../theme';
import { RootStackParamList } from '../../types';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Processing'>;
type RoutePropType = RouteProp<RootStackParamList, 'Processing'>;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Map backend stage → step index (0-4)
const STAGE_MAP: Record<string, number> = {
  queued:             0,
  loading_embeddings: 1,
  clustering:         2,
  saving_results:     3,
  complete:           4,
};

const STEPS = ['Detection', 'Embedding', 'Clustering', 'Validation', 'Final output'];

export default function ProcessingScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { currentAlbumId, refreshAlbums } = useAlbums();

  // albumId comes from navigation params or fall back to context
  const albumId = route.params?.albumId ?? currentAlbumId;

  const [activeStep, setActiveStep] = useState(0);

  // Look up album name from context
  const { albums } = useAlbums();
  const albumName = albums.find(a => a.album_id === albumId)?.name ?? (albumId ? 'Processing...' : 'Your album');

  const progressAnim = useRef(new Animated.Value(301.6)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Poll status every 2 seconds
  useEffect(() => {
    if (!albumId) {
      // No albumId — just show animated screen and go to Clusters after 4s
      const t = setTimeout(() => navigation.replace('Clusters' as any), 4000);
      return () => clearTimeout(t);
    }

    let isCancelled = false;

    const poll = async () => {
      try {
        const status = await getAlbumStatus(albumId);
        if (isCancelled) return;

        const step = STAGE_MAP[status.stage] ?? STAGE_MAP[status.status] ?? 0;
        setActiveStep(step);

        // Animate progress ring based on step
        const targetOffset = 301.6 - (301.6 * ((step + 1) / STEPS.length));
        Animated.timing(progressAnim, {
          toValue: targetOffset,
          duration: 500,
          useNativeDriver: true,
        }).start();

        if (status.status === 'complete') {
          setActiveStep(4);
          await refreshAlbums();
          setTimeout(() => {
            if (!isCancelled) navigation.replace('Clusters' as any, { albumId });
          }, 1000);
          return; // Stop polling
        }

        if (status.status === 'failed') {
          setTimeout(() => {
            if (!isCancelled) navigation.goBack();
          }, 2000);
          return;
        }

        // Continue polling
        if (!isCancelled) setTimeout(poll, 2000);
      } catch {
        if (!isCancelled) setTimeout(poll, 3000);
      }
    };

    poll();
    return () => { isCancelled = true; };
  }, [albumId]);

  const pct = Math.round(((activeStep + 1) / STEPS.length) * 100);

  const stepStyle = (i: number) => {
    if (i < activeStep) return { color: palette.green, dot: palette.green, bg: 'rgba(0,220,130,0.12)', border: 'rgba(0,220,130,0.25)', label: 'Done' };
    if (i === activeStep) return { color: palette.cyan2, dot: palette.cyan2, bg: 'rgba(0,212,255,0.12)', border: 'rgba(0,212,255,0.25)', label: 'Running' };
    return { color: palette.muted, dot: 'rgba(255,255,255,0.15)', bg: 'rgba(255,255,255,0.04)', border: palette.border, label: 'Waiting' };
  };

  return (
    <AnimatedBackground orbs={[ { color: 'rgba(0,212,255,0.1)', size: 200, top: 60, left: '50%' } ]}>
      <View style={styles.container}>

        <View style={styles.header}>
          <Text style={styles.title}>Processing album</Text>
          <Text style={styles.subtitle}>{albumName}</Text>
        </View>

        {/* Circular Progress */}
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
            <Text style={styles.percentText}>{pct}%</Text>
            <Text style={styles.percentLabel}>complete</Text>
          </View>
        </View>

        {/* Step list */}
        <View style={styles.list}>
          {STEPS.map((label, i) => {
            const s = stepStyle(i);
            const isActive = i === activeStep;
            return (
              <GlassCard key={i} style={[styles.stepCard, isActive && { borderColor: 'rgba(0,212,255,0.3)' }]}>
                {isActive ? (
                  <Animated.View style={[styles.dot, { backgroundColor: s.dot, opacity: pulseAnim }]} />
                ) : (
                  <View style={[styles.dot, { backgroundColor: s.dot }]} />
                )}
                <Text style={[styles.stepTitle, { color: s.color }]}>{label}</Text>
                <View style={[styles.pill, { backgroundColor: s.bg, borderColor: s.border }]}>
                  <Text style={[styles.pillText, { color: s.color }]}>{s.label}</Text>
                </View>
              </GlassCard>
            );
          })}
        </View>

        <Text style={styles.footerText}>
          {activeStep < 4 ? 'Estimated time: ~45 seconds' : 'Done! Navigating to results...'}
        </Text>

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
  stepCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  stepTitle: { flex: 1, fontSize: 12, fontFamily: getFont('Syne', '600') },

  pill: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1 },
  pillText: { fontSize: 10, fontFamily: getFont('DMSans', '500') },

  footerText: { fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400') }
});
