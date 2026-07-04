import { NativeModule, requireNativeModule } from 'expo';

declare class ExpoImageTensorModule extends NativeModule {
  imageToTensor(uriString: string, width: number, height: number): Promise<Uint8Array>;
  getRawPixels(uriString: string, cropX: number, cropY: number, cropW: number, cropH: number): Promise<Uint8Array>;
}

export default requireNativeModule<ExpoImageTensorModule>('ExpoImageTensor');
