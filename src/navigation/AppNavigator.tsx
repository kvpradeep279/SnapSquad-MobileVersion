import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { palette } from '../theme';

// Screens
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';

import HomeScreen from '../screens/main/HomeScreen';
import UploadScreen from '../screens/main/UploadScreen';
import ProcessingScreen from '../screens/main/ProcessingScreen';
import ClustersScreen from '../screens/main/ClustersScreen';
import ClusterDetailScreen from '../screens/main/ClusterDetailScreen';
import ExportScreen from '../screens/main/ExportScreen';
import SettingsScreen from '../screens/main/SettingsScreen';

import { RootStackParamList } from '../types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/* 
 * Flattened stack to mimic the exact navigation capability
 * of the 12-page mockup prototype.
 */
export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Onboarding"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.background },
          animation: 'fade', // Smooth fading to match the mockup's screen transitions
        }}
      >
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Auth" component={LoginScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />

        {/* Main Flow */}
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Upload" component={UploadScreen} />
        <Stack.Screen name="Processing" component={ProcessingScreen} />
        <Stack.Screen name="Clusters" component={ClustersScreen} />
        <Stack.Screen name="ClusterDetail" component={ClusterDetailScreen} />
        <Stack.Screen name="Export" component={ExportScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
