import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle, Path, Rect, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import AnimatedBackground from '../../components/AnimatedBackground';
import GlassCard from '../../components/GlassCard';
import GradientButton from '../../components/GradientButton';
import { palette, fontFamily, getFont } from '../../theme';
import { RootStackParamList } from '../../types';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

export default function OnboardingScreen() {
  const navigation = useNavigation<NavProp>();
  const [step, setStep] = useState(1);
  const fadeAnim = React.useRef(new Animated.Value(1)).current;

  const navigateTo = (nextStep: number) => {
    if (nextStep > 3) {
      navigation.replace('Auth');
      return;
    }
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setStep(nextStep);
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  };

  const renderDots = (currentStep: number) => (
    <View style={styles.dotsRow}>
      {[1, 2, 3].map((s) => {
        if (s === currentStep) {
          return (
            <LinearGradient
              key={s}
              colors={palette.gradient.hero}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.dotActive}
            />
          );
        }
        return <View key={s} style={styles.dotInactive} />;
      })}
    </View>
  );

  return (
    <AnimatedBackground
      orbs={
        step === 1 ? [
          { color: 'rgba(123,92,245,0.18)', size: 260, top: -60, left: -60 },
          { color: 'rgba(0,212,255,0.10)', size: 200, top: 180, right: -80 }
        ] : step === 2 ? [
          { color: 'rgba(0,212,255,0.12)', size: 220, top: -40, right: -40 },
          { color: 'rgba(123,92,245,0.14)', size: 180, bottom: 120, left: -60 }
        ] : [
          { color: 'rgba(77,235,160,0.08)', size: 240, top: 60, left: '50%' } // Wait, left 50% needs to be adjusted in RN, but we'll use center
        ]
      }
    >
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        
        {step === 1 && (
          <View style={styles.contentBetween}>
            <View style={styles.centerCol}>
              <Svg width="88" height="88" viewBox="0 0 88 88" fill="none">
                <Circle cx="44" cy="44" r="43" stroke="rgba(123,92,245,0.3)" strokeWidth="1"/>
                <Circle cx="44" cy="44" r="36" stroke="rgba(0,212,255,0.2)" strokeWidth="0.5"/>
                <Path d="M44 18 C44 18, 62 28, 66 44 C70 60, 58 72, 44 72 C30 72, 18 60, 22 44 C26 28, 44 18, 44 18Z" stroke="rgba(200,208,224,0.6)" strokeWidth="1.5" fill="none"/>
                <Path d="M44 18 C44 18, 26 28, 22 44 C18 60, 30 72, 44 72" stroke="rgba(123,92,245,0.8)" strokeWidth="1.5" fill="none"/>
                <Path d="M28 26 C36 20, 52 20, 60 26" stroke="rgba(0,212,255,0.6)" strokeWidth="1" fill="none"/>
                <Path d="M22 44 C22 44, 18 37, 24 30" stroke="rgba(123,92,245,0.4)" strokeWidth="1" fill="none"/>
                <Circle cx="44" cy="44" r="6" stroke="rgba(200,208,224,0.4)" strokeWidth="1"/>
                <Circle cx="44" cy="44" r="2" fill="rgba(200,208,224,0.6)"/>
                <Circle cx="44" cy="18" r="3" fill="#9B7FF8"/>
                <Circle cx="66" cy="44" r="2.5" fill="#00D4FF"/>
                <Circle cx="44" cy="72" r="2.5" fill="rgba(200,208,224,0.5)"/>
                <Circle cx="22" cy="44" r="2" fill="rgba(123,92,245,0.5)"/>
              </Svg>
              <Text style={[styles.syneTitle, { fontSize: 26, marginTop: 12 }]}>SnapSquad</Text>
            </View>

            <View style={{ alignItems: 'center', paddingHorizontal: 16 }}>
              <Text style={styles.syneHeadline}>Every face.</Text>
              <Text style={styles.syneHeadlineGrad}>Every memory.</Text>
              <Text style={styles.dmDesc}>Upload your group photos and let SnapSquad intelligently cluster every person — so your memories are always organized.</Text>
            </View>

            <View style={{ width: '100%', gap: 16 }}>
              <View style={styles.row}>
                <GlassCard style={styles.statCard}><Text style={[styles.statValue, { color: palette.violet2 }]}>98%</Text><Text style={styles.statLabel}>Accuracy</Text></GlassCard>
                <GlassCard style={styles.statCard}><Text style={[styles.statValue, { color: palette.cyan2 }]}>2s</Text><Text style={styles.statLabel}>Per photo</Text></GlassCard>
                <GlassCard style={styles.statCard}><Text style={[styles.statValue, { color: palette.green }]}>100%</Text><Text style={styles.statLabel}>Private</Text></GlassCard>
              </View>
              <GradientButton title="Get started" onPress={() => navigateTo(2)} />
              {renderDots(1)}
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.contentBetweenTight}>
            <View>
              <Text style={styles.dmSubtitle}>What SnapSquad does</Text>
              <Text style={[styles.syneHeadline, { textAlign: 'left', marginBottom: 20 }]}>Intelligent{'\n'}<Text style={styles.syneHeadlineGrad}>face clustering</Text></Text>

              <View style={{ gap: 10 }}>
                {/* Detection */}
                <GlassCard style={styles.featureCard}>
                  <View style={[styles.featIconBox, { backgroundColor: 'rgba(123,92,245,0.2)', borderColor: 'rgba(123,92,245,0.3)' }]}>
                    <Svg width="20" height="20" viewBox="0 0 20 20" fill="none"><Circle cx="10" cy="7" r="4" stroke="#9B7FF8" strokeWidth="1.5"/><Path d="M3 17c0-3.31 3.13-6 7-6s7 2.69 7 6" stroke="#9B7FF8" strokeWidth="1.5" strokeLinecap="round"/></Svg>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featTitle}>Face detection</Text>
                    <Text style={styles.featDesc}>Detects every face in your photos</Text>
                  </View>
                </GlassCard>
                {/* Clustering */}
                <GlassCard style={styles.featureCard}>
                  <View style={[styles.featIconBox, { backgroundColor: 'rgba(0,212,255,0.15)', borderColor: 'rgba(0,212,255,0.25)' }]}>
                    <Svg width="20" height="20" viewBox="0 0 20 20" fill="none"><Rect x="2" y="2" width="7" height="7" rx="2" stroke="#4DE8FF" strokeWidth="1.5"/><Rect x="11" y="2" width="7" height="7" rx="2" stroke="#4DE8FF" strokeWidth="1.5" opacity="0.5"/><Rect x="2" y="11" width="7" height="7" rx="2" stroke="#4DE8FF" strokeWidth="1.5" opacity="0.5"/><Rect x="11" y="11" width="7" height="7" rx="2" stroke="#4DE8FF" strokeWidth="1.5"/></Svg>
                  </View>
                  <View>
                    <Text style={styles.featTitle}>Smart clustering</Text>
                    <Text style={styles.featDesc}>Groups same person across all photos</Text>
                  </View>
                </GlassCard>
                {/* Albums */}
                <GlassCard style={styles.featureCard}>
                  <View style={[styles.featIconBox, { backgroundColor: 'rgba(77,235,160,0.12)', borderColor: 'rgba(77,235,160,0.25)' }]}>
                    <Svg width="20" height="20" viewBox="0 0 20 20" fill="none"><Path d="M4 12l4 4 8-8" stroke="#4DEBA0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></Svg>
                  </View>
                  <View>
                    <Text style={styles.featTitle}>Seamless albums</Text>
                    <Text style={styles.featDesc}>Name, share, and export by person</Text>
                  </View>
                </GlassCard>
                {/* Confidence */}
                <GlassCard style={styles.featureCard}>
                  <View style={[styles.featIconBox, { backgroundColor: 'rgba(255,208,96,0.12)', borderColor: 'rgba(255,208,96,0.2)' }]}>
                    <Svg width="20" height="20" viewBox="0 0 20 20" fill="none"><Path d="M10 2l1.8 5.5H18l-4.9 3.6 1.9 5.5L10 13.1l-5 3.5 1.9-5.5L2 7.5h6.2z" stroke="#FFD060" strokeWidth="1.4" strokeLinejoin="round"/></Svg>
                  </View>
                  <View>
                    <Text style={styles.featTitle}>Confidence scoring</Text>
                    <Text style={styles.featDesc}>Review and correct uncertain matches</Text>
                  </View>
                </GlassCard>
              </View>
            </View>
            <View style={{ width: '100%', gap: 16 }}>
              <GradientButton title="Continue" onPress={() => navigateTo(3)} />
              {renderDots(2)}
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={styles.contentBetween}>
            <View style={{ alignItems: 'center' }}>
              <View style={[styles.featIconBox, { width: 72, height: 72, borderRadius: 24, backgroundColor: 'rgba(77,235,160,0.1)', borderColor: 'rgba(77,235,160,0.3)', marginBottom: 16 }]}>
                <Svg width="32" height="32" viewBox="0 0 32 32" fill="none"><Path d="M16 4L6 8v8c0 6.63 4.29 12.83 10 14 5.71-1.17 10-7.37 10-14V8L16 4z" stroke="#4DEBA0" strokeWidth="1.5" strokeLinejoin="round"/><Path d="M11 16l3.5 3.5 6.5-6.5" stroke="#4DEBA0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></Svg>
              </View>
              <Text style={styles.syneHeadline}>Your data stays{'\n'}<Text style={{color: palette.green}}>yours. Always.</Text></Text>
              <Text style={styles.dmDesc}>SnapSquad uses end-to-end encryption. Your face data is never sold, never shared, and never stored beyond your session.</Text>
            </View>

            <View style={{ width: '100%', gap: 10 }}>
              {['End-to-end encrypted in transit', 'Face data processed on-device only', 'Delete everything anytime, instantly', 'No third-party data sharing, ever'].map((text, i) => (
                <GlassCard key={i} style={styles.checkCard}>
                  <View style={styles.checkDot} />
                  <Text style={styles.checkText}>{text}</Text>
                </GlassCard>
              ))}
            </View>

            <View style={{ width: '100%', gap: 16 }}>
              <GradientButton title="I agree — let's go" onPress={() => navigateTo(4)} />
              {renderDots(3)}
            </View>
          </View>
        )}
      </Animated.View>
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 40, paddingBottom: 30 },
  contentBetween: { flex: 1, justifyContent: 'space-between', alignItems: 'center' },
  contentBetweenTight: { flex: 1, justifyContent: 'space-between' },
  centerCol: { alignItems: 'center' },
  
  syneTitle: { fontFamily: getFont('Syne', '800'), color: palette.silver2 },
  syneHeadline: { fontFamily: getFont('Syne', '800'), fontSize: 28, color: palette.silver2, textAlign: 'center', lineHeight: 32 },
  syneHeadlineGrad: { color: palette.cyan }, // Fallback without SVG mask on native, using cyan core
  dmDesc: { fontFamily: getFont('DMSans', '400'), fontSize: 13, color: palette.muted, textAlign: 'center', marginTop: 14, lineHeight: 20, paddingHorizontal: 8 },
  dmSubtitle: { fontFamily: getFont('DMSans', '400'), fontSize: 11, color: palette.muted, marginBottom: 6 },
  
  row: { flexDirection: 'row', gap: 8, width: '100%' },
  statCard: { flex: 1, padding: 12, alignItems: 'center' },
  statValue: { fontFamily: getFont('Syne', '800'), fontSize: 18 },
  statLabel: { fontFamily: getFont('DMSans', '400'), fontSize: 10, color: palette.muted, marginTop: 4 },
  
  featureCard: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 },
  featIconBox: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  featTitle: { fontFamily: getFont('Syne', '700'), fontSize: 13, color: palette.silver2 },
  featDesc: { fontFamily: getFont('DMSans', '400'), fontSize: 11, color: palette.muted, marginTop: 2 },
  
  checkCard: { padding: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.green },
  checkText: { fontFamily: getFont('DMSans', '400'), fontSize: 12, color: palette.silver },
  
  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  dotInactive: { width: 6, height: 4, borderRadius: 2, backgroundColor: palette.glass2 },
  dotActive: { width: 20, height: 4, borderRadius: 2 },
});
