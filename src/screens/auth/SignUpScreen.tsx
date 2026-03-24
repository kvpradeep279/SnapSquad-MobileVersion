import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import AnimatedBackground from '../../components/AnimatedBackground';
import GradientButton from '../../components/GradientButton';
import { palette, getFont } from '../../theme';
import { RootStackParamList } from '../../types';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Auth'>;

export default function SignUpScreen() {
  const navigation = useNavigation<NavProp>();

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
            <TextInput style={styles.input} placeholder="Full name" placeholderTextColor={palette.silver2} />
            <TextInput style={styles.input} placeholder="Email address" placeholderTextColor={palette.silver2} keyboardType="email-address" autoCapitalize="none" />
            <TextInput style={[styles.input, { color: palette.muted }]} placeholder="Password" placeholderTextColor={palette.muted} secureTextEntry />
            <TextInput style={[styles.input, { color: palette.muted }]} placeholder="Confirm password" placeholderTextColor={palette.muted} secureTextEntry />

            <GradientButton 
              title="Create account" 
              onPress={() => navigation.navigate('Home' as any)} 
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
            <TouchableOpacity onPress={() => navigation.navigate('Auth' as any)}><Text style={[styles.footerText, { color: palette.violet2 }]}>Sign in</Text></TouchableOpacity>
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
  subtitle: { fontFamily: getFont('DMSans', '400'), fontSize: 11, color: palette.muted, marginBottom: 4 },
  title: { fontFamily: getFont('Syne', '800'), fontSize: 24, color: palette.silver2 },
  
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
  footerText: { fontSize: 12, color: palette.muted, fontFamily: getFont('DMSans', '400') }
});
