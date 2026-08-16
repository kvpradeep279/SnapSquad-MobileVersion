import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { palette } from '../theme';

// Screens
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';
import LoginScreen from '../screens/auth/LoginScreen';

import HomeScreen from '../screens/main/HomeScreen';
import UploadScreen from '../screens/main/UploadScreen';
import ProcessingScreen from '../screens/main/ProcessingScreen';
import ClustersScreen from '../screens/main/ClustersScreen';
import ClusterDetailScreen from '../screens/main/ClusterDetailScreen';
import SettingsScreen from '../screens/main/SettingsScreen';
import EditProfileScreen from '../screens/main/EditProfileScreen';

// V2 Room screens
import RoomQRScreen from '../screens/main/RoomQRScreen';
import RoomJoinScreen from '../screens/main/RoomJoinScreen';
import PendingRequestsScreen from '../screens/main/PendingRequestsScreen';
import RoomsScreen from '../screens/main/RoomsScreen';
import UploadHubScreen from '../screens/main/UploadHubScreen';
import RoomDetailScreen from '../screens/main/RoomDetailScreen';
import FindMeScreen from '../screens/main/FindMeScreen';

import { RootStackParamList } from '../types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking = {
  prefixes: ['Plexida://'],
  config: {
    screens: {
      // e.g. Plexida://room/123e4567-e89b-12d3-a456-426614174000
      RoomJoin: 'room/:roomId',
    },
  },
};

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
    <NavigationContainer linking={linking}>
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
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="People" component={require('../screens/main/PeopleScreen').default} />
            <Stack.Screen name="PersonDetail" component={require('../screens/main/PersonDetailScreen').default} />
            {/* V2 Room screens */}
            <Stack.Screen name="RoomQR" component={RoomQRScreen} />
            <Stack.Screen name="RoomJoin" component={RoomJoinScreen} />
            <Stack.Screen name="PendingRequests" component={PendingRequestsScreen} />
            <Stack.Screen name="Rooms" component={RoomsScreen} />
            <Stack.Screen name="UploadHub" component={UploadHubScreen} />
            <Stack.Screen name="RoomDetail" component={RoomDetailScreen} />
            <Stack.Screen name="FindMe" component={FindMeScreen} />
          </>
        ) : (
          // Not authenticated — show onboarding + auth
          <>
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="Auth" component={LoginScreen} />

          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
