import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';

import AnimatedBackground from '../../components/AnimatedBackground';
import GradientButton from '../../components/GradientButton';
import { useAuth } from '../../context/AuthContext';
import { palette, getFont } from '../../theme';
import { RootStackParamList } from '../../types';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Auth'>;

export default function LoginScreen() {
  const navigation = useNavigation<NavProp>();
  const { signIn, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    setLoading(true);
    await signIn(email, password);
    setLoading(false);
  };

  return (
    <AnimatedBackground
      orbs={[ { color: 'rgba(123,92,245,0.15)', size: 220, top: -60, right: -40 } ]}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          
          <View style={styles.header}>
            <Text style={styles.subtitle}>Welcome back</Text>
            <Text style={styles.title}>Sign in to{'\n'}<Text style={{color: palette.cyan}}>SnapSquad</Text></Text>
          </View>

          <View style={styles.form}>
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TextInput 
              style={styles.input} 
              placeholder="pradeep@example.com" 
              placeholderTextColor={palette.silver2} 
              keyboardType="email-address" 
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            
            <TextInput 
              style={[styles.input, { color: palette.muted }]} 
              placeholder="••••••••••" 
              placeholderTextColor={palette.muted} 
              secureTextEntry
              value={password}
              onChangeText={setPassword}
             />

            <TouchableOpacity style={styles.forgotBtn}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            <GradientButton 
              title={loading ? "Signing in..." : "Sign in"} 
              onPress={handleSignIn} 
              style={{ marginBottom: 10 }} 
            />

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.divider} />
            </View>

            <View style={styles.socialRow}>
              <TouchableOpacity style={styles.ghostBtn}>
                <Svg width="16" height="16" viewBox="0 0 24 24">
                  <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </Svg>
                <Text style={styles.ghostText}>Google</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.ghostBtn}>
                <Svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                  <Path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </Svg>
                <Text style={styles.ghostText}>Apple</Text>
              </TouchableOpacity>
            </View>

          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('SignUp' as any)}>
              <Text style={[styles.footerText, { color: palette.violet2 }]}>Sign up</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 20, paddingTop: 60, justifyContent: 'space-between' },
  header: { marginBottom: 24, marginTop: 40 },
  subtitle: { fontFamily: getFont('DMSans', '500'), fontSize: 11, color: palette.muted, marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' },
  title: { fontFamily: getFont('Syne', '700'), fontSize: 24, color: palette.silver2, lineHeight: 30, letterSpacing: -0.5 },
  
  form: { flex: 1 },
  input: {
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    color: palette.silver2,
    fontFamily: getFont('DMSans', '400'),
    fontSize: 14,
    marginBottom: 10,
  },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 16 },
  forgotText: { fontSize: 12, color: palette.violet2, fontFamily: getFont('DMSans', '400') },
  
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  divider: { flex: 1, height: 1, backgroundColor: palette.border },
  dividerText: { fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400') },
  
  socialRow: { flexDirection: 'row', gap: 8 },
  ghostBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: palette.glass2,
    borderWidth: 1,
    borderColor: palette.border2,
    borderRadius: 16,
    paddingVertical: 11,
  },
  ghostText: { color: palette.silver, fontFamily: getFont('DMSans', '500'), fontSize: 13 },
  
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  footerText: { fontSize: 12, color: palette.muted, fontFamily: getFont('DMSans', '400') },
  errorBox: { backgroundColor: 'rgba(255,80,80,0.12)', borderWidth: 1, borderColor: 'rgba(255,80,80,0.25)', borderRadius: 12, padding: 10, marginBottom: 10 },
  errorText: { color: 'rgba(255,112,112,0.9)', fontSize: 12, fontFamily: getFont('DMSans', '400'), textAlign: 'center' }
});
