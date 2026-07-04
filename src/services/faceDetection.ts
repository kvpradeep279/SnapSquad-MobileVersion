/**
 * faceDetection.ts — On-device face detection using SCRFD-10G (TFLite)
 *
 * ARCHITECTURE:
 *   Runs SCRFD-10G model on device to detect faces in a photo.
 *   Returns bounding boxes (x1, y1, x2, y2), keypoints, and confidence scores.
 *   No data ever leaves the device during detection.
 *
 * MODEL:
 *   scrfd_10g_bnkps.onnx → onnx2tf → scrfd.tflite
 *   Original ONNX input:  [1, 3, 640, 640] (NCHW)
 *   TFLite input (after onnx2tf): [1, 640, 640, 3] (NHWC, BGR, normalized to [-1, 1])
 *   Output: 9 tensors — Score(×3), Box(×3), Keypoints(×3) across strides (8, 16, 32)
 *
 * PIXEL DECODING:
 *   Uses fast-png (pure JS, no native deps) to properly decode PNG → raw RGBA pixels.
 *   Previous bug: atob(base64) of compressed PNG bytes was treated as raw pixel data → garbage.
 *
 * CHANNEL ORDER:
 *   InsightFace models (SCRFD, MobileFaceNet) expect BGR input (OpenCV convention).
 *   onnx2tf preserves channel semantics — so TFLite models also expect BGR.
 *   fast-png gives RGB → we swap R↔B when building the tensor.
 *
 * USAGE:
 *   const faces = await detectFaces(photoUri);
 *   // faces: Array<{ bbox: [x1, y1, x2, y2], kps: number[][], score: number }>
 */

import { loadTensorflowModel, TensorflowModel } from 'react-native-fast-tflite';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { decode as decodePNG } from 'fast-png';
import { imageToTensor } from '../../modules/expo-image-tensor';

// ── Constants ────────────────────────────────────────────────────────────────

const MODEL_INPUT_SIZE = 640;         // SCRFD expects 640×640 input
const DETECTION_THRESHOLD = 0.40;     // Balanced threshold: captures real faces while avoiding background noise
const NMS_THRESHOLD = 0.4;            // Non-max suppression IoU threshold
const MAX_FACES = 50;                 // Max faces per photo — supports large group photos
const MIN_FACE_SIZE_PX = 20;          // Min face width OR height in original image pixels
const MIN_FACE_AREA_PX = 400;         // Min face area (20×20) — filters border artifacts

// ── Model singleton ──────────────────────────────────────────────────────────

let scrfdModel: TensorflowModel | null = null;

async function getSCRFDModel(): Promise<TensorflowModel> {
  if (!scrfdModel) {
    scrfdModel = await loadTensorflowModel(
      require('../../assets/models/scrfd.tflite')
    );
  }
  return scrfdModel;
}

// ── Result type ───────────────────────────────────────────────────────────────

export interface DetectedFace {
  /** Bounding box [x1, y1, x2, y2] in pixel coordinates of the ORIGINAL image */
  bbox: [number, number, number, number];
  /** 5 Facial keypoints [[x,y]×5] in pixel coords of the ORIGINAL image */
  kps: number[][];
  /** SCRFD detection score (0-1) */
  score: number;
  /** Face index within this photo */
  faceIndex: number;
  /** Original image dimensions (needed for affine alignment coordinate scaling) */
  imgWidth: number;
  imgHeight: number;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Detect all faces in a photo.
 *
 * @param photoUri - Local URI of the photo (from image picker or camera)
 * @returns Array of detected faces sorted by confidence, highest first
 */
export async function detectFaces(photoUri: string): Promise<DetectedFace[]> {
  const model = await getSCRFDModel();

  // Step 1: Get original image dimensions BEFORE resizing
  // We need these so keypoints can be returned in original pixel coordinates
  const { width: origW, height: origH } = await getImageDimensions(photoUri);

  // Step 2: Build properly decoded + normalized input tensor
  const inputTensor = await imageToSCRFDTensor(photoUri);

  console.log('[SCRFD] Input tensor size:', inputTensor.length,
    'expected:', MODEL_INPUT_SIZE * MODEL_INPUT_SIZE * 3);
  console.log('[SCRFD] Original image dimensions:', origW, '×', origH);

  // Step 3: Run SCRFD inference
  let outputs = await model.run([inputTensor]);

  // Handle generic output from react-native-fast-tflite
  if (!Array.isArray(outputs)) {
    outputs = [outputs];
  }

  const floatOutputs = (outputs as Int8Array[] | Float32Array[]).map((arr) =>
    arr instanceof Float32Array ? arr : new Float32Array(arr.buffer, arr.byteOffset, arr.length)
  );

  console.log('[SCRFD] Output tensors:', floatOutputs.length,
    'sizes:', floatOutputs.map(a => a.length));

  // Step 4: Parse boxes + keypoints + scores, apply NMS
  // Pass original image dims so scaleX/scaleY maps 640×640 coords back to original pixel space
  const faces = parseScrfDetections(
    floatOutputs,
    origW,
    origH
  );

  console.log('[SCRFD] Detected', faces.length, 'faces above threshold', DETECTION_THRESHOLD);

  return faces.slice(0, MAX_FACES).map((f, i) => ({
    ...f,
    faceIndex: i,
    imgWidth: origW,
    imgHeight: origH,
  }));
}

// ── Image Dimensions Helper ───────────────────────────────────────────────────

/**
 * Get original image pixel dimensions by converting to PNG and reading the header.
 * Must be called on the original photo URI (before any resizing).
 */
async function getImageDimensions(photoUri: string): Promise<{ width: number; height: number }> {
  // Convert to PNG first (handles JPEG, HEIC, etc.) at tiny size just to read dims
  // We use a small resize trick: resize to 1px wide, read height ratio
  // Actually: manipulateAsync returns width/height in its result — use that!
  const info = await manipulateAsync(
    photoUri,
    [],  // no operations — just get metadata
    { format: SaveFormat.PNG }
  );
  return { width: info.width, height: info.height };
}

// ── Pixel Decoding (FIXED) ───────────────────────────────────────────────────

/**
 * Properly decode an image to a normalized Float32Array for SCRFD.
 *
 * Pipeline:
 *   Image URI → resize to 640×640 → save as PNG → read as base64 →
 *   fast-png decode → raw RGBA pixels → NHWC BGR float tensor [-1, 1]
 *
 * Key fixes over previous implementation:
 *   1. Uses fast-png to properly decompress PNG → raw RGBA (not treating file bytes as pixels)
 *   2. Writes tensor in NHWC layout (interleaved) — onnx2tf converts NCHW → NHWC
 *   3. Swaps R↔B for BGR channel order (InsightFace convention)
 */
async function imageToSCRFDTensor(photoUri: string): Promise<Float32Array> {
  const h = MODEL_INPUT_SIZE;
  const w = MODEL_INPUT_SIZE;
  
  // Call the extremely fast C++/Kotlin/Swift Expo Native Module
  // that reads the image, resizes it, and constructs the [-1,1] BGR tensor directly
  // skipping Base64, JS PNG parsing, and massive for-loops.
  const uint8 = await imageToTensor(photoUri, w, h);
  
  // The native bridge returns a Uint8Array representing the raw bytes of the Float tensor.
  // We cast the underlying memory buffer to a Float32Array for zero-copy high-speed transfer!
  return new Float32Array(uint8.buffer, uint8.byteOffset, uint8.byteLength / 4);
}

// ── SCRFD Output Parsing ─────────────────────────────────────────────────────

/**
 * Parse 9 raw SCRFD output tensors into scale-corrected bounding boxes and keypoints.
 *
 * SCRFD-10G outputs 9 tensors across 3 strides (8, 16, 32):
 *   Stride  8: 80×80×2 = 12800 anchors → score(12800), box(51200), kps(128000)
 *   Stride 16: 40×40×2 =  3200 anchors → score(3200),  box(12800), kps(32000)
 *   Stride 32: 20×20×2 =   800 anchors → score(800),   box(3200),  kps(8000)
 */
function parseScrfDetections(
  outputs: Float32Array[],
  imgW: number,
  imgH: number
): Omit<DetectedFace, 'faceIndex' | 'imgWidth' | 'imgHeight'>[] {
  // Local type for candidates before NMS (no faceIndex/imgWidth/imgHeight yet)
  type CandidateFace = { bbox: [number, number, number, number]; kps: number[][]; score: number };

  let s8Score: Float32Array | undefined, s8Box: Float32Array | undefined, s8Kps: Float32Array | undefined;
  let s16Score: Float32Array | undefined, s16Box: Float32Array | undefined, s16Kps: Float32Array | undefined;
  let s32Score: Float32Array | undefined, s32Box: Float32Array | undefined, s32Kps: Float32Array | undefined;

  // Hardcoded index mapping from ONNX→TFLite output array indices (most reliable)
  // Determined experimentally from the onnx2tf conversion output order:
  // 0: 800 (s32Score), 1: 32000 (s16Kps), 2: 12800 (s8Score), 3: 8000 (s32Kps),
  // 4: 12800 (s16Box), 5: 51200 (s8Box), 6: 3200 (s16Score), 7: 3200 (s32Box),
  // 8: 128000 (s8Kps)
  if (outputs.length === 9 && outputs[0].length === 800) {
    s32Score = outputs[0]; s16Kps = outputs[1]; s8Score = outputs[2];
    s32Kps = outputs[3];   s16Box = outputs[4]; s8Box = outputs[5];
    s16Score = outputs[6]; s32Box = outputs[7]; s8Kps = outputs[8];
  } else {
    // Fallback: map by tensor length
    for (const arr of outputs) {
      switch (arr.length) {
        case 12800:
          if (!s8Score) s8Score = arr;
          else if (!s16Box) s16Box = arr;
          break;
        case 51200: s8Box = arr; break;
        case 128000: s8Kps = arr; break;
        case 3200:
          if (!s16Score) s16Score = arr;
          else if (!s32Box) s32Box = arr;
          break;
        case 32000: s16Kps = arr; break;
        case 800: s32Score = arr; break;
        case 8000: s32Kps = arr; break;
      }
    }
  }

  // ── Diagnostic: dump score tensor statistics to determine if sigmoid is needed ──
  const dumpStats = (name: string, arr?: Float32Array) => {
    if (!arr) return;
    let min = Infinity, max = -Infinity, sum = 0;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] < min) min = arr[i];
      if (arr[i] > max) max = arr[i];
      sum += arr[i];
    }
    console.log(`[SCRFD] ${name}: min=${min.toFixed(4)} max=${max.toFixed(4)} mean=${(sum/arr.length).toFixed(4)}`);
  };
  dumpStats('s8Score', s8Score);
  dumpStats('s16Score', s16Score);
  dumpStats('s32Score', s32Score);

  const scaleX = imgW / MODEL_INPUT_SIZE;
  const scaleY = imgH / MODEL_INPUT_SIZE;
  const candidates: CandidateFace[] = [];

  const decodeStride = (
    stride: number,
    scoreArr: Float32Array,
    boxArr: Float32Array,
    kpsArr: Float32Array,
    anchorCountX: number,
    anchorCountY: number
  ) => {
    let idx = 0;
    for (let y = 0; y < anchorCountY; y++) {
      for (let x = 0; x < anchorCountX; x++) {
        const cx = x * stride;
        const cy = y * stride;

        // 2 anchors per cell
        for (let a = 0; a < 2; a++) {
          // Scores are already post-sigmoid from the TFLite model (values in [0, 1])
          // DO NOT apply sigmoid again — diagnostic confirmed raw scores like 0.82, not logits
          const score = scoreArr[idx];
          if (score >= DETECTION_THRESHOLD) {
            // Distance 2 BBox
            const bx1 = (cx - boxArr[idx * 4 + 0] * stride) * scaleX;
            const by1 = (cy - boxArr[idx * 4 + 1] * stride) * scaleY;
            const bx2 = (cx + boxArr[idx * 4 + 2] * stride) * scaleX;
            const by2 = (cy + boxArr[idx * 4 + 3] * stride) * scaleY;

            // Distance 2 Keypoints (5 points)
            const kps = [];
            for (let k = 0; k < 5; k++) {
              const kpx = (cx + kpsArr[idx * 10 + k * 2 + 0] * stride) * scaleX;
              const kpy = (cy + kpsArr[idx * 10 + k * 2 + 1] * stride) * scaleY;
              kps.push([kpx, kpy]);
            }

            // Quality filters — mirror Python InsightFace preprocessing
            const faceW = bx2 - bx1;
            const faceH = by2 - by1;
            const faceArea = faceW * faceH;

            if (faceW < MIN_FACE_SIZE_PX || faceH < MIN_FACE_SIZE_PX) {
              idx++;
              continue; // Too small — probably artifact or background clutter
            }
            if (faceArea < MIN_FACE_AREA_PX) {
              idx++;
              continue; // Zero/near-zero area — invalid bbox
            }
            if (bx1 >= bx2 || by1 >= by2) {
              idx++;
              continue; // Degenerate bbox (corner artifact like [608,608,608,608])
            }

            candidates.push({ bbox: [bx1, by1, bx2, by2], kps, score });
          }
          idx++;
        }
      }
    }
  };

  if (s8Score && s8Box && s8Kps) decodeStride(8, s8Score, s8Box, s8Kps, 80, 80);
  if (s16Score && s16Box && s16Kps) decodeStride(16, s16Score, s16Box, s16Kps, 40, 40);
  if (s32Score && s32Box && s32Kps) decodeStride(32, s32Score, s32Box, s32Kps, 20, 20);

  candidates.sort((a, b) => b.score - a.score);
  return applyNMS(candidates, NMS_THRESHOLD);
}

/**
 * Greedy Non-Maximum Suppression on bounding boxes.
 */
type CandidateFace = { bbox: [number, number, number, number]; kps: number[][]; score: number };
function applyNMS(
  boxes: CandidateFace[],
  iouThresh: number
): CandidateFace[] {
  const kept: typeof boxes = [];
  const suppressed = new Set<number>();

  for (let i = 0; i < boxes.length; i++) {
    if (suppressed.has(i)) continue;
    kept.push(boxes[i]);
    for (let j = i + 1; j < boxes.length; j++) {
      if (iou(boxes[i].bbox, boxes[j].bbox) > iouThresh) {
        suppressed.add(j);
      }
    }
  }
  return kept;
}

function iou(a: [number, number, number, number], b: [number, number, number, number]): number {
  const interX1 = Math.max(a[0], b[0]);
  const interY1 = Math.max(a[1], b[1]);
  const interX2 = Math.min(a[2], b[2]);
  const interY2 = Math.min(a[3], b[3]);
  const interArea = Math.max(0, interX2 - interX1) * Math.max(0, interY2 - interY1);
  const aArea = (a[2] - a[0]) * (a[3] - a[1]);
  const bArea = (b[2] - b[0]) * (b[3] - b[1]);
  return interArea / (aArea + bArea - interArea + 1e-6);
}
