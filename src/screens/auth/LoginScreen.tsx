import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import AnimatedBackground from '../../components/AnimatedBackground';
import { useAuth } from '../../context/AuthContext';
import { palette, getFont } from '../../theme';

export default function LoginScreen() {
  const { signInWithGoogle, error, clearError } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    clearError();
    setLoading(true);
    await signInWithGoogle();
    setLoading(false);
    // Navigation happens automatically via AuthContext → AppNavigator
  };

  return (
    <AnimatedBackground
      orbs={[
        { color: 'rgba(123,92,245,0.15)', size: 220, top: -60, right: -40 },
        { color: 'rgba(0,212,255,0.08)', size: 180, bottom: -40, left: -30 },
      ]}
    >
      <View style={styles.container}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.subtitle}>Welcome to</Text>
            <Text style={styles.title}>
              <Text style={{ color: palette.cyan }}>Snap</Text>Squad
            </Text>
            <Text style={styles.tagline}>
              Face-based group photo{'\n'}organization — powered by AI,{'\n'}protected by privacy.
            </Text>
          </View>

          {/* Sign In Section */}
          <View style={styles.signInSection}>
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.googleBtn}
              onPress={handleGoogleSignIn}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color={palette.white} />
              ) : (
                <>
                  <View style={styles.googleIconContainer}>
                    <Svg width="20" height="20" viewBox="0 0 24 24">
                      <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </Svg>
                  </View>
                  <Text style={styles.googleBtnText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.privacyNote}>
              By signing in, you agree to our Terms of Service{'\n'}and Privacy Policy.
            </Text>
          </View>
        </View>
      </View>
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 80,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  subtitle: {
    fontFamily: getFont('DMSans', '500'),
    fontSize: 13,
    color: palette.muted,
    marginBottom: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: getFont('Syne', '700'),
    fontSize: 40,
    color: palette.silver2,
    lineHeight: 48,
    letterSpacing: -1,
    marginBottom: 16,
  },
  tagline: {
    fontFamily: getFont('DMSans', '400'),
    fontSize: 15,
    color: palette.muted,
    lineHeight: 22,
  },

  signInSection: {
    gap: 16,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.glass2,
    borderWidth: 1,
    borderColor: palette.border2,
    borderRadius: 16,
    paddingVertical: 15,
    gap: 12,
  },
  googleIconContainer: {
    width: 24,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleBtnText: {
    color: palette.silver2,
    fontFamily: getFont('DMSans', '600'),
    fontSize: 15,
  },
  privacyNote: {
    textAlign: 'center',
    fontSize: 11,
    color: palette.muted,
    fontFamily: getFont('DMSans', '400'),
    lineHeight: 16,
    opacity: 0.7,
  },

  errorBox: {
    backgroundColor: 'rgba(255,80,80,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,80,80,0.25)',
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    color: 'rgba(255,112,112,0.9)',
    fontSize: 13,
    fontFamily: getFont('DMSans', '400'),
    textAlign: 'center',
  },
});
