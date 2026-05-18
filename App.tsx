import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './src/context/AuthContext';
import { AlbumProvider } from './src/context/AlbumContext';
import AppNavigator from './src/navigation/AppNavigator';

// Load Mockup Fonts
import { useFonts } from 'expo-font';
import { 
  Syne_400Regular, 
  Syne_600SemiBold, 
  Syne_700Bold, 
  Syne_800ExtraBold 
} from '@expo-google-fonts/syne';
import { 
  DMSans_400Regular, 
  DMSans_500Medium,
  DMSans_700Bold
} from '@expo-google-fonts/dm-sans';

export default function App() {
  const [fontsLoaded] = useFonts({
    Syne_400Regular,
    Syne_600SemiBold,
    Syne_700Bold,
    Syne_800ExtraBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
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
