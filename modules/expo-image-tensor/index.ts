import ExpoImageTensorModule from './src/ExpoImageTensorModule';

export function imageToTensor(uri: string, width: number, height: number): Promise<Uint8Array> {
  return ExpoImageTensorModule.imageToTensor(uri, width, height);
}

export function getRawPixels(
  uri: string,
  cropX: number,
  cropY: number,
  cropW: number,
  cropH: number
): Promise<Uint8Array> {
  return ExpoImageTensorModule.getRawPixels(uri, cropX, cropY, cropW, cropH);
}

export * from './src/ExpoImageTensor.types';
