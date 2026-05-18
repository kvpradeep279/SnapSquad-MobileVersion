import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

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

  const handleSignUp = async () => {
    if (!name || !email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
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
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TextInput 
              style={styles.input} 
              placeholder="Full name" 
              placeholderTextColor={palette.silver2} 
              value={name}
              onChangeText={setName}
            />
            <TextInput 
              style={styles.input} 
              placeholder="Email address" 
              placeholderTextColor={palette.silver2} 
              keyboardType="email-address" 
              autoCapitalize="none" 
              value={email}
              onChangeText={setEmail}
            />
            <TextInput 
              style={[styles.input, { color: palette.silver2 }]} 
              placeholder="Password" 
              placeholderTextColor={palette.muted} 
              secureTextEntry 
              value={password}
              onChangeText={setPassword}
            />
            <TextInput 
              style={[styles.input, { color: palette.silver2 }]} 
              placeholder="Confirm password" 
              placeholderTextColor={palette.muted} 
              secureTextEntry 
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />

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

            <TouchableOpacity style={styles.ghostBtn}>
              <Text style={styles.ghostText}>Continue with Google</Text>
            </TouchableOpacity>

          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Auth' as any)}>
              <Text style={[styles.footerText, { color: palette.violet2 }]}>Sign in</Text>
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
  
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  footerText: { fontSize: 12, color: palette.muted, fontFamily: getFont('DMSans', '400') },

  errorBox: { backgroundColor: 'rgba(255,80,80,0.12)', borderWidth: 1, borderColor: 'rgba(255,80,80,0.25)', borderRadius: 12, padding: 10, marginBottom: 10 },
  errorText: { color: 'rgba(255,112,112,0.9)', fontSize: 12, fontFamily: getFont('DMSans', '400'), textAlign: 'center' }
});
