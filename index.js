// Polyfill TextDecoder for latin1 support (Hermes only supports utf-8)
// Must be first import — fast-png needs this at module load time
import './src/polyfills/textDecoder';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
