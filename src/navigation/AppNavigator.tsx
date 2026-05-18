import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
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
import EditProfileScreen from '../screens/main/EditProfileScreen';

import { RootStackParamList } from '../types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { isLoggedIn, isLoading } = useAuth();

  // Show loading spinner while checking SecureStore for token
  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={palette.violet2} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.background },
          animation: 'fade',
        }}
      >
        {isLoggedIn ? (
          // Authenticated — show main app screens
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Upload" component={UploadScreen} />
            <Stack.Screen name="Processing" component={ProcessingScreen} />
            <Stack.Screen name="Clusters" component={ClustersScreen} />
            <Stack.Screen name="ClusterDetail" component={ClusterDetailScreen} />
            <Stack.Screen name="Export" component={ExportScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="People" component={require('../screens/main/PeopleScreen').default} />
            <Stack.Screen name="PersonDetail" component={require('../screens/main/PersonDetailScreen').default} />
          </>
        ) : (
          // Not authenticated — show onboarding + auth
          <>
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="Auth" component={LoginScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
