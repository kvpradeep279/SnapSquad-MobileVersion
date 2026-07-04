import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';

import AnimatedBackground from '../../components/AnimatedBackground';
import GradientButton from '../../components/GradientButton';
import { useAuth } from '../../context/AuthContext';
import { palette, getFont } from '../../theme';
import { RootStackParamList } from '../../types';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Auth'>;

export default function SignUpScreen() {
  const navigation = useNavigation<NavProp>();
  const { signUp, error } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [valError, setValError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSignUp = async () => {
    setValError('');
    if (!name || !email || !password || !confirmPassword) {
      setValError('Please fill all fields');
      return;
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setValError('Please enter a valid email address');
      return;
    }
    
    // Password validation
    if (password.length < 6) {
      setValError('Password must be at least 6 characters long');
      return;
    }
    
    if (password !== confirmPassword) {
      setValError('Passwords do not match');
      return;
    }
    setLoading(true);
    await signUp(email, name, password); // Note: server expects 'username' which we fill with 'name'
    setLoading(false);
    // Navigation automatically happens via AuthContext → AppNavigator
  };

  return (
    <AnimatedBackground
      orbs={[ { color: 'rgba(0,212,255,0.1)', size: 200, top: -40, left: -40 } ]}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          
          <View style={styles.header}>
            <Text style={styles.subtitle}>Create account</Text>
            <Text style={styles.title}>Join <Text style={{color: palette.cyan}}>SnapSquad</Text></Text>
          </View>

          <View style={styles.form}>
            {(error || valError) ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error || valError}</Text>
              </View>
            ) : null}

            <TextInput 
              style={[styles.input, { color: palette.white }]} 
              placeholder="Full name" 
              placeholderTextColor="rgba(255, 255, 255, 0.4)" 
              value={name}
              onChangeText={setName}
            />
            <TextInput 
              style={[styles.input, { color: palette.white }]} 
              placeholder="Email address" 
              placeholderTextColor="rgba(255, 255, 255, 0.4)" 
              keyboardType="email-address" 
              autoCapitalize="none" 
              value={email}
              onChangeText={setEmail}
            />
            <View style={styles.passwordContainer}>
              <TextInput 
                style={styles.passwordInput} 
                placeholder="Password" 
                placeholderTextColor="rgba(255, 255, 255, 0.4)" 
                secureTextEntry={!showPassword} 
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                <Feather name={showPassword ? "eye" : "eye-off"} size={18} color={palette.muted} />
              </TouchableOpacity>
            </View>

            <View style={styles.passwordContainer}>
              <TextInput 
                style={styles.passwordInput} 
                placeholder="Confirm password" 
                placeholderTextColor="rgba(255, 255, 255, 0.4)" 
                secureTextEntry={!showConfirmPassword} 
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeIcon}>
                <Feather name={showConfirmPassword ? "eye" : "eye-off"} size={18} color={palette.muted} />
              </TouchableOpacity>
            </View>

            <GradientButton 
              title={loading ? "Creating account..." : "Create account"} 
              onPress={handleSignUp} 
              style={{ marginTop: 6 }} 
            />

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.divider} />
            </View>

            <TouchableOpacity style={styles.ghostBtn} onPress={() => Alert.alert('Coming Soon', 'Google sign-in will be available in V2.')}>
              <Text style={styles.ghostText}>Continue with Google</Text>
            </TouchableOpacity>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Auth' as any)}>
                <Text style={[styles.footerText, { color: palette.violet2 }]}>Sign in</Text>
              </TouchableOpacity>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 20, paddingTop: 60, justifyContent: 'space-between' },
  header: { marginBottom: 20, marginTop: 40 },
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
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    marginBottom: 10,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 13,
    paddingHorizontal: 16,
    color: palette.white,
    fontFamily: getFont('DMSans', '400'),
    fontSize: 14,
  },
  eyeIcon: {
    padding: 13,
  },
  
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 10 },
  divider: { flex: 1, height: 1, backgroundColor: palette.border },
  dividerText: { fontSize: 11, color: palette.muted, fontFamily: getFont('DMSans', '400') },
  
  ghostBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.glass2,
    borderWidth: 1,
    borderColor: palette.border2,
    borderRadius: 16,
    paddingVertical: 11,
  },
  ghostText: { color: palette.silver, fontFamily: getFont('DMSans', '500'), fontSize: 13 },
  
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  footerText: { fontSize: 12, color: palette.muted, fontFamily: getFont('DMSans', '400') },

  errorBox: { backgroundColor: 'rgba(255,80,80,0.12)', borderWidth: 1, borderColor: 'rgba(255,80,80,0.25)', borderRadius: 12, padding: 10, marginBottom: 10 },
  errorText: { color: 'rgba(255,112,112,0.9)', fontSize: 12, fontFamily: getFont('DMSans', '400'), textAlign: 'center' }
});
