package expo.modules.imagetensor

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.Rect
import android.net.Uri
import android.media.ExifInterface
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.InputStream

class ExpoImageTensorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoImageTensor")

    // ── imageToTensor: for SCRFD (640x640) and fallback MBF embedding ──────
    AsyncFunction("imageToTensor") { uriString: String, width: Int, height: Int ->
      val bitmap = loadAndRotateBitmap(uriString) ?: throw Exception("Could not load bitmap")
      val scaledBitmap = Bitmap.createScaledBitmap(bitmap, width, height, true)
      if (bitmap != scaledBitmap) bitmap.recycle()

      val pixels = IntArray(width * height)
      scaledBitmap.getPixels(pixels, 0, width, 0, 0, width, height)
      scaledBitmap.recycle()

      val tensorBytes = ByteArray(width * height * 3 * 4)
      val byteBuffer = java.nio.ByteBuffer.wrap(tensorBytes).order(java.nio.ByteOrder.LITTLE_ENDIAN)
      val floatBuffer = byteBuffer.asFloatBuffer()
      for (pixel in pixels) {
        val r = (pixel shr 16) and 0xff
        val g = (pixel shr 8) and 0xff
        val b = pixel and 0xff
        floatBuffer.put((b / 127.5f) - 1.0f)
        floatBuffer.put((g / 127.5f) - 1.0f)
        floatBuffer.put((r / 127.5f) - 1.0f)
      }
      tensorBytes
    }

    // ── getRawPixels: crop a region and return raw RGBA bytes for JS warpAffine ──
    AsyncFunction("getRawPixels") { uriString: String, cropX: Int, cropY: Int, cropW: Int, cropH: Int ->
      val bitmap = loadAndRotateBitmap(uriString) ?: throw Exception("Could not load bitmap")
      val safeX = cropX.coerceIn(0, bitmap.width - 1)
      val safeY = cropY.coerceIn(0, bitmap.height - 1)
      val safeW = cropW.coerceIn(1, bitmap.width - safeX)
      val safeH = cropH.coerceIn(1, bitmap.height - safeY)

      val cropped = Bitmap.createBitmap(bitmap, safeX, safeY, safeW, safeH)
      bitmap.recycle()

      val pixels = IntArray(safeW * safeH)
      cropped.getPixels(pixels, 0, safeW, 0, 0, safeW, safeH)
      cropped.recycle()

      // Return RGBA bytes: 4 bytes per pixel
      val rgba = ByteArray(safeW * safeH * 4)
      for (i in pixels.indices) {
        val pixel = pixels[i]
        rgba[i * 4 + 0] = ((pixel shr 16) and 0xff).toByte() // R
        rgba[i * 4 + 1] = ((pixel shr 8) and 0xff).toByte()  // G
        rgba[i * 4 + 2] = (pixel and 0xff).toByte()           // B
        rgba[i * 4 + 3] = ((pixel shr 24) and 0xff).toByte() // A
      }
      // First 8 bytes are width and height (2 x Int32 LE) for JS to read
      val result = ByteArray(8 + rgba.size)
      val header = java.nio.ByteBuffer.wrap(result, 0, 8).order(java.nio.ByteOrder.LITTLE_ENDIAN)
      header.putInt(safeW)
      header.putInt(safeH)
      System.arraycopy(rgba, 0, result, 8, rgba.size)
      result
    }
  }

  private fun loadAndRotateBitmap(uriString: String): Bitmap? {
    val context = appContext.reactContext ?: return null
    val uri = Uri.parse(uriString)

    var inputStream: InputStream? = context.contentResolver.openInputStream(uri)
    val originalBitmap = BitmapFactory.decodeStream(inputStream)
    inputStream?.close()
    if (originalBitmap == null) return null

    var rotationDegrees = 0
    try {
      inputStream = context.contentResolver.openInputStream(uri)
      if (inputStream != null) {
        val exif = ExifInterface(inputStream!!)
        val orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        rotationDegrees = when (orientation) {
          ExifInterface.ORIENTATION_ROTATE_90 -> 90
          ExifInterface.ORIENTATION_ROTATE_180 -> 180
          ExifInterface.ORIENTATION_ROTATE_270 -> 270
          else -> 0
        }
        inputStream!!.close()
      }
    } catch (e: Exception) {}

    if (rotationDegrees == 0) return originalBitmap
    val matrix = Matrix()
    matrix.postRotate(rotationDegrees.toFloat())
    val rotated = Bitmap.createBitmap(originalBitmap, 0, 0, originalBitmap.width, originalBitmap.height, matrix, true)
    if (originalBitmap != rotated) originalBitmap.recycle()
    return rotated
  }
}

