import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './src/context/AuthContext';
import { AlbumProvider } from './src/context/AlbumContext';
import AppNavigator from './src/navigation/AppNavigator';
import { initializeFirebase } from './src/config/firebase';

// Initialize Firebase services early in the app lifecycle
initializeFirebase();

// Load Mockup Fonts
import { useFonts } from 'expo-font';
import { 
  Inter_300Light,
  Inter_400Regular, 
  Inter_500Medium,
  Inter_600SemiBold, 
  Inter_700Bold, 
  Inter_800ExtraBold 
} from '@expo-google-fonts/inter';

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <AlbumProvider>
            <AppNavigator />
            <StatusBar style="light" />
          </AlbumProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
