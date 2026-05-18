/**
 * faceEmbedding.ts — On-device face embedding using MobileFaceNet (TFLite)
 *
 * ARCHITECTURE:
 *   Takes a detected face (bbox + 5 keypoints from SCRFD), performs affine
 *   alignment to produce a 112×112 aligned face crop, then runs MobileFaceNet
 *   to get a 512-d embedding vector.
 *
 * KEY FIX — Affine Alignment:
 *   The notebook (5_improved_pipeline.ipynb) used InsightFace's rec_model.get()
 *   which internally aligns the face using 5 keypoints before embedding.
 *   Without alignment, the same person at different head angles produces
 *   cosine similarities of 0.20-0.30 — below HDBSCAN's clustering threshold.
 *   With alignment, same-person similarity is 0.50-0.80 → clusters correctly.
 *
 *   Reference template (InsightFace standard 112×112):
 *     Eye-L [38.29, 51.70], Eye-R [73.53, 51.50], Nose [56.02, 71.74]
 *     Mouth-L [41.55, 92.37], Mouth-R [70.73, 92.20]
 *
 * MODEL:
 *   w600k_mbf.onnx → onnx2tf → mobilefacenet.tflite
 *   Input:  [1, 112, 112, 3] (NHWC, BGR, normalized to [-1, 1])
 *   Output: [1, 512] float32 — L2-normalized face embedding
 *
 * USAGE:
 *   const embedding = await extractEmbedding(photoUri, face.kps, face.bbox);
 *   // Returns Float32Array of length 512
 */

import { loadTensorflowModel, TensorflowModel } from 'react-native-fast-tflite';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { decode as decodePNG } from 'fast-png';

// ── Constants ─────────────────────────────────────────────────────────────────

const MBF_INPUT_SIZE = 112;  // MobileFaceNet standard input
const EMBEDDING_DIM  = 512;  // w600k_mbf outputs 512-d embeddings

/**
 * InsightFace standard 5-point alignment template for 112×112 output.
 * Order: left_eye, right_eye, nose, mouth_left, mouth_right
 * Source: insightface/utils/face_align.py — arcface_src
 */
const ARCFACE_TEMPLATE_112: [number, number][] = [
  [38.29459953, 51.69630051],
  [73.53179932, 51.50139999],
  [56.02519989, 71.73660278],
  [41.54930115, 92.3655014],
  [70.72990036, 92.20410156],
];

// ── Model singleton ───────────────────────────────────────────────────────────

let mbfModel: TensorflowModel | null = null;

async function getMBFModel(): Promise<TensorflowModel> {
  if (!mbfModel) {
    mbfModel = await loadTensorflowModel(
      require('../../assets/models/mobilefacenet.tflite')
    );
  }
  return mbfModel;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Extract a 512-d raw face embedding from a detected face.
 *
 * Uses 5-point affine alignment (InsightFace standard) when keypoints are
 * available. Falls back to padded bbox crop if kps are missing/invalid.
 *
 * @param photoUri  - Local URI of the original photo
 * @param kps       - 5 facial keypoints [[x,y]×5] from SCRFD in original image coords
 * @param bbox      - Fallback bounding box [x1, y1, x2, y2] if kps are bad
 * @param imgWidth  - Original image width (for bounds clamping)
 * @param imgHeight - Original image height (for bounds clamping)
 * @returns Raw 512-d embedding (NOT yet privacy-protected — pass to privacy.ts)
 */
export async function extractEmbedding(
  photoUri: string,
  kps: number[][],
  bbox: [number, number, number, number],
  imgWidth: number,
  imgHeight: number,
): Promise<Float32Array> {
  const model = await getMBFModel();

  // Step 1: Get aligned 112×112 face tensor using keypoints
  const inputTensor = await alignedFaceToTensor(photoUri, kps, bbox, imgWidth, imgHeight);

  console.log('[MBF] Input tensor size:', inputTensor.length,
    'expected:', MBF_INPUT_SIZE * MBF_INPUT_SIZE * 3);

  // Step 2: Run MobileFaceNet
  const outputs = await model.run([inputTensor]);
  const rawOutput = outputs[0];

  // Cast model output to Float32Array
  const rawEmbedding = rawOutput instanceof Float32Array
    ? rawOutput
    : new Float32Array(rawOutput.buffer, rawOutput.byteOffset, EMBEDDING_DIM);

  // Step 3: L2-normalize the embedding
  const normalized = l2Normalize(rawEmbedding.slice(0, EMBEDDING_DIM) as Float32Array);

  // Debug: log embedding stats
  let embNorm = 0;
  for (let i = 0; i < Math.min(10, normalized.length); i++) embNorm += normalized[i] * normalized[i];
  console.log('[MBF] Embedding first-10 norm:', Math.sqrt(embNorm).toFixed(4),
    'sample values:', Array.from(normalized.slice(0, 5)).map(v => v.toFixed(4)));

  return normalized;
}

/**
 * Extract embeddings for multiple faces in a single photo.
 */
export async function extractAllEmbeddings(
  photoUri: string,
  faces: { kps: number[][]; bbox: [number, number, number, number] }[],
  imgWidth: number,
  imgHeight: number,
): Promise<Float32Array[]> {
  if (faces.length === 0) return [];
  return Promise.all(
    faces.map(f => extractEmbedding(photoUri, f.kps, f.bbox, imgWidth, imgHeight))
  );
}

// ── Affine Alignment ─────────────────────────────────────────────────────────

/**
 * Compute a 2D similarity transform (scale + rotation + translation, no shear)
 * that maps the detected keypoints to the InsightFace 112×112 reference template.
 *
 * Uses the closed-form least-squares solution for similarity transforms
 * (Umeyama algorithm, 2D case):
 *   [dst] ≈ s * R * [src] + t
 *
 * Returns a 2×3 affine matrix M such that:
 *   dst_x = M[0]*src_x + M[1]*src_y + M[2]
 *   dst_y = M[3]*src_x + M[4]*src_y + M[5]
 */
function computeSimilarityTransform(
  srcPts: [number, number][],  // detected keypoints (5 points)
  dstPts: [number, number][],  // template keypoints (5 points)
): number[] /* 2×3 matrix as flat [a, b, tx, c, d, ty] */ {
  const n = srcPts.length;

  // Compute centroids
  let sx = 0, sy = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    sx += srcPts[i][0]; sy += srcPts[i][1];
    dx += dstPts[i][0]; dy += dstPts[i][1];
  }
  const srcMeanX = sx / n, srcMeanY = sy / n;
  const dstMeanX = dx / n, dstMeanY = dy / n;

  // Center both point sets
  const srcC: [number, number][] = srcPts.map(p => [p[0] - srcMeanX, p[1] - srcMeanY]);
  const dstC: [number, number][] = dstPts.map(p => [p[0] - dstMeanX, p[1] - dstMeanY]);

  // Compute scale (variance of src)
  let srcVar = 0;
  for (let i = 0; i < n; i++) srcVar += srcC[i][0] ** 2 + srcC[i][1] ** 2;
  srcVar /= n;

  // Compute cross-covariance matrix elements
  let cov00 = 0, cov01 = 0, cov10 = 0, cov11 = 0;
  for (let i = 0; i < n; i++) {
    cov00 += srcC[i][0] * dstC[i][0];
    cov01 += srcC[i][0] * dstC[i][1];
    cov10 += srcC[i][1] * dstC[i][0];
    cov11 += srcC[i][1] * dstC[i][1];
  }
  cov00 /= n; cov01 /= n; cov10 /= n; cov11 /= n;

  // Least-squares rotation (no SVD needed for 2D similarity)
  // a = (cov00 + cov11), b = (cov01 - cov10)
  const a = cov00 + cov11;
  const b = cov01 - cov10;
  const scale = srcVar > 1e-8 ? Math.sqrt(a * a + b * b) / srcVar : 1.0;
  const cosR = srcVar > 1e-8 ? a / (srcVar * (scale + 1e-8)) : 1.0;
  const sinR = srcVar > 1e-8 ? b / (srcVar * (scale + 1e-8)) : 0.0;

  // 2×2 rotation-scale matrix
  const m00 = scale * cosR,  m01 = -scale * sinR;
  const m10 = scale * sinR,  m11 =  scale * cosR;

  // Translation: t = dstMean - M * srcMean
  const tx = dstMeanX - (m00 * srcMeanX + m01 * srcMeanY);
  const ty = dstMeanY - (m10 * srcMeanX + m11 * srcMeanY);

  return [m00, m01, tx, m10, m11, ty];
}

/**
 * Apply a 2×3 affine transform to produce an aligned 112×112 face crop.
 * Uses bilinear interpolation for sub-pixel accuracy (matches OpenCV warpAffine).
 *
 * Transform maps OUTPUT coords → INPUT coords (inverse mapping, avoids holes):
 *   src_x = inv[0]*dst_x + inv[1]*dst_y + inv[2]
 *   src_y = inv[3]*dst_x + inv[4]*dst_y + inv[5]
 */
function warpAffine(
  srcPixels: Uint8Array,
  srcW: number,
  srcH: number,
  srcChannels: number,
  M: number[],  // forward transform [a, b, tx, c, d, ty]
  outW: number,
  outH: number,
): Uint8Array {
  // Invert 2×2 part of M for inverse mapping
  const det = M[0] * M[4] - M[1] * M[3];
  const invDet = Math.abs(det) > 1e-10 ? 1.0 / det : 1.0;
  const iM00 = M[4] * invDet,  iM01 = -M[1] * invDet;
  const iM10 = -M[3] * invDet, iM11 = M[0] * invDet;
  const iTx = -(iM00 * M[2] + iM01 * M[5]);
  const iTy = -(iM10 * M[2] + iM11 * M[5]);

  // Output: 3 channels (RGB) for the aligned crop
  const out = new Uint8Array(outW * outH * 3);

  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      // Map output pixel → source coords
      const sx = iM00 * dx + iM01 * dy + iTx;
      const sy = iM10 * dx + iM11 * dy + iTy;

      // Bilinear interpolation
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = x0 + 1, y1 = y0 + 1;
      const fx = sx - x0, fy = sy - y0;

      // Clamp to image bounds
      const cx0 = Math.max(0, Math.min(srcW - 1, x0));
      const cy0 = Math.max(0, Math.min(srcH - 1, y0));
      const cx1 = Math.max(0, Math.min(srcW - 1, x1));
      const cy1 = Math.max(0, Math.min(srcH - 1, y1));

      const outIdx = (dy * outW + dx) * 3;

      for (let c = 0; c < 3; c++) {
        const p00 = srcPixels[(cy0 * srcW + cx0) * srcChannels + c];
        const p10 = srcPixels[(cy0 * srcW + cx1) * srcChannels + c];
        const p01 = srcPixels[(cy1 * srcW + cx0) * srcChannels + c];
        const p11 = srcPixels[(cy1 * srcW + cx1) * srcChannels + c];
        // Bilinear blend
        out[outIdx + c] = Math.round(
          p00 * (1 - fx) * (1 - fy) +
          p10 * fx       * (1 - fy) +
          p01 * (1 - fx) * fy +
          p11 * fx       * fy
        );
      }
    }
  }
  return out;
}

/**
 * Check if keypoints are valid (all finite, within reasonable image bounds,
 * and have non-zero spread — i.e., not all the same point).
 */
function kpsAreValid(
  kps: number[][],
  imgW: number,
  imgH: number,
): boolean {
  if (!kps || kps.length < 5) return false;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of kps) {
    if (!isFinite(x) || !isFinite(y)) return false;
    if (x < -imgW || x > 2 * imgW) return false;  // allow small OOB
    if (y < -imgH || y > 2 * imgH) return false;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  // Keypoints must have some spread (not all collapsed to one point)
  return (maxX - minX) > 2 && (maxY - minY) > 2;
}

/**
 * Produce a normalized Float32Array [112*112*3] NHWC BGR [-1,1] from
 * a source image, aligning the face using 5 keypoints.
 *
 * Strategy:
 *   1. Crop a padded region around the face bbox using manipulateAsync
 *      (handles JPEG, HEIC, etc. — converts to PNG)
 *   2. Decode the small PNG crop with fast-png
 *   3. Shift keypoints to crop-relative coordinates
 *   4. Run computeSimilarityTransform + warpAffine on the small crop
 *
 * This avoids loading the full (potentially 48MB) raw image into memory.
 * Falls back to padded bbox crop if keypoints are invalid.
 */
async function alignedFaceToTensor(
  photoUri: string,
  kps: number[][],
  bbox: [number, number, number, number],
  imgWidth: number,
  imgHeight: number,
): Promise<Float32Array> {
  const outSize = MBF_INPUT_SIZE;

  // ── Path A: Affine alignment using keypoints ──────────────────────────────
  if (kpsAreValid(kps, imgWidth, imgHeight)) {
    try {
      const [bx1, by1, bx2, by2] = bbox;
      const faceW = Math.max(1, bx2 - bx1);
      const faceH = Math.max(1, by2 - by1);

      // Expand the crop region generously around the face so the
      // affine warp has enough context (especially for ear/chin regions)
      const expandFactor = 0.8;
      const cropX = Math.max(0, Math.round(bx1 - faceW * expandFactor));
      const cropY = Math.max(0, Math.round(by1 - faceH * expandFactor));
      const cropX2 = Math.min(imgWidth,  Math.round(bx2 + faceW * expandFactor));
      const cropY2 = Math.min(imgHeight, Math.round(by2 + faceH * expandFactor));
      const cropW = Math.max(1, cropX2 - cropX);
      const cropH = Math.max(1, cropY2 - cropY);

      // Step 1: Crop just the face region and convert to PNG.
      // manipulateAsync handles JPEG/HEIC correctly; SaveFormat.PNG gives
      // us a file that fast-png can decode.
      const cropped = await manipulateAsync(
        photoUri,
        [{ crop: { originX: cropX, originY: cropY, width: cropW, height: cropH } }],
        { format: SaveFormat.PNG }
      );

      // Step 2: Decode the PNG crop to raw pixels
      const base64 = await FileSystem.readAsStringAsync(cropped.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const png = decodePNG(bytes);
      const srcPixels = png.data as Uint8Array;
      const srcW = png.width, srcH = png.height, srcCh = png.channels;

      // Step 3: Adjust keypoints to crop-relative coordinates.
      // kps are in original image pixel space; subtract the crop origin.
      const srcKps: [number, number][] = kps.map(([x, y]) => [
        x - cropX,
        y - cropY,
      ]);

      // Validate kps are within the crop bounds (some might be outside if
      // the face is near the image edge)
      const margin = -30; // allow 30px outside crop
      const kpsInBounds = srcKps.every(
        ([x, y]) => x > margin && x < srcW - margin && y > margin && y < srcH - margin
      );
      if (!kpsInBounds) {
        console.warn('[MBF] Keypoints outside crop bounds — using bbox crop fallback');
        throw new Error('kps out of bounds');
      }

      // Step 4: Compute similarity transform: srcKps → ArcFace 112×112 template
      const M = computeSimilarityTransform(srcKps, ARCFACE_TEMPLATE_112);

      // Step 5: Apply affine warp to get aligned 112×112 RGB crop
      const alignedRGB = warpAffine(srcPixels, srcW, srcH, srcCh, M, outSize, outSize);

      // Step 6: Convert RGB → NHWC BGR Float32 normalized to [-1, 1]
      const tensor = new Float32Array(outSize * outSize * 3);
      for (let i = 0; i < outSize * outSize; i++) {
        const r = alignedRGB[i * 3 + 0];
        const g = alignedRGB[i * 3 + 1];
        const b = alignedRGB[i * 3 + 2];
        tensor[i * 3 + 0] = b / 127.5 - 1.0;  // B
        tensor[i * 3 + 1] = g / 127.5 - 1.0;  // G
        tensor[i * 3 + 2] = r / 127.5 - 1.0;  // R
      }

      console.log('[MBF] ✅ Affine alignment succeeded (crop:', cropW, '×', cropH, ')');
      return tensor;

    } catch (err) {
      console.warn('[MBF] Affine alignment failed, falling back to bbox crop:', err);
    }
  } else {
    console.warn('[MBF] Invalid keypoints — using fallback bbox crop');
  }

  // ── Path B: Fallback — padded bbox crop (no alignment) ───────────────────
  const [x1, y1, x2, y2] = bbox;
  const cropW = Math.max(1, x2 - x1);
  const cropH = Math.max(1, y2 - y1);
  const padX = Math.round(cropW * 0.1);
  const padY = Math.round(cropH * 0.1);

  const originX = Math.max(0, Math.round(x1) - padX);
  const originY = Math.max(0, Math.round(y1) - padY);
  const safeW = Math.min(Math.round(imgWidth) - originX, cropW + padX * 2);
  const safeH = Math.min(Math.round(imgHeight) - originY, cropH + padY * 2);

  const cropped = await manipulateAsync(
    photoUri,
    [
      {
        crop: {
          originX,
          originY,
          width:  Math.max(1, safeW),
          height: Math.max(1, safeH),
        },
      },
      { resize: { width: outSize, height: outSize } },
    ],
    { format: SaveFormat.PNG }
  );

  return faceImageToTensor(cropped.uri);
}


// ── Pixel Decoding (FIXED) ───────────────────────────────────────────────────

/**
 * Convert a pre-cropped face image to a properly normalized Float32Array.
 * Format: [H, W, 3] NHWC — BGR channel order — values normalized to [-1, 1].
 * Used as fallback when affine alignment is not possible.
 */
async function faceImageToTensor(imageUri: string): Promise<Float32Array> {
  const h = MBF_INPUT_SIZE;
  const w = MBF_INPUT_SIZE;

  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const png = decodePNG(bytes);
  const pixelData = png.data as Uint8Array;
  const channels = png.channels; // 3=RGB, 4=RGBA

  const tensor = new Float32Array(h * w * 3);
  for (let i = 0; i < h * w; i++) {
    const r = pixelData[i * channels + 0];
    const g = pixelData[i * channels + 1];
    const b = pixelData[i * channels + 2];
    tensor[i * 3 + 0] = b / 127.5 - 1.0;  // B
    tensor[i * 3 + 1] = g / 127.5 - 1.0;  // G
    tensor[i * 3 + 2] = r / 127.5 - 1.0;  // R
  }

  return tensor;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * L2-normalize a vector so that ||v|| = 1.
 * Ensures cosine similarity = dot product between unit vectors.
 */
export function l2Normalize(v: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) + 1e-10;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

/**
 * Compute cosine similarity between two L2-normalized embeddings.
 * Range: [-1, 1], where 1 = identical face.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
