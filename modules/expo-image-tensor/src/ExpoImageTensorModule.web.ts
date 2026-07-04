import { registerWebModule, NativeModule } from 'expo';

class ExpoImageTensorModule extends NativeModule<{}> {}

export default registerWebModule(ExpoImageTensorModule, 'ExpoImageTensorModule');
