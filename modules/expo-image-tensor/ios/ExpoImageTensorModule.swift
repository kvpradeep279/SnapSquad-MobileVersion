import ExpoModulesCore
import UIKit
import CoreGraphics

public class ExpoImageTensorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoImageTensor")

    AsyncFunction("imageToTensor") { (uriString: String, width: Int, height: Int) -> Data in
      guard let url = URL(string: uriString),
            let data = try? Data(contentsOf: url),
            let image = UIImage(data: data) else {
        throw Exception(name: "ERR_IMAGE_LOAD", description: "Could not load image from URI")
      }

      let targetSize = CGSize(width: width, height: height)
      let rect = CGRect(origin: .zero, size: targetSize)
      
      UIGraphicsBeginImageContextWithOptions(targetSize, false, 1.0)
      image.draw(in: rect)
      let scaledImage = UIGraphicsGetImageFromCurrentImageContext()
      UIGraphicsEndImageContext()
      
      guard let cgImage = scaledImage?.cgImage else {
        throw Exception(name: "ERR_IMAGE_RESIZE", description: "Could not get CGImage after resize")
      }

      let colorSpace = CGColorSpaceCreateDeviceRGB()
      let bytesPerPixel = 4
      let bytesPerRow = bytesPerPixel * width
      var rawData = [UInt8](repeating: 0, count: width * height * bytesPerPixel)
      
      guard let context = CGContext(
        data: &rawData,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: bytesPerRow,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
      ) else {
        throw Exception(name: "ERR_CONTEXT", description: "Could not create CGContext")
      }
      
      context.draw(cgImage, in: rect)
      
      let numPixels = width * height
      var tensorData = Data(count: numPixels * 3 * 4)
      
      tensorData.withUnsafeMutableBytes { rawBufferPointer in
        let floatPointer = rawBufferPointer.bindMemory(to: Float32.self).baseAddress!
        for i in 0..<numPixels {
          let r = Float32(rawData[i * 4 + 0])
          let g = Float32(rawData[i * 4 + 1])
          let b = Float32(rawData[i * 4 + 2])
          
          floatPointer[i * 3 + 0] = (b / 127.5) - 1.0
          floatPointer[i * 3 + 1] = (g / 127.5) - 1.0
          floatPointer[i * 3 + 2] = (r / 127.5) - 1.0
        }
      }
      
      return tensorData
    }.runOnQueue(.global(qos: .userInitiated))
  }
}
