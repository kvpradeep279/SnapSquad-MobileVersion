"""
Convert SCRFD and MobileFaceNet ONNX models to TFLite format.

Approach:
  1. For MobileFaceNet (simple sequential model): onnx2tf works cleanly
  2. For SCRFD (complex detection model with dynamic anchors): use simplified
     opset conversion first via onnxsim, then onnx2tf

Run from the project root:
  Notebooks/venv/Scripts/python.exe scripts/convert_models.py
"""

import os, sys, shutil, tempfile

NOTEBOOKS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'Notebooks', 'models'))
OUTPUT_DIR    = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'assets', 'models'))
os.makedirs(OUTPUT_DIR, exist_ok=True)

SCRFD_ONNX  = os.path.join(NOTEBOOKS_DIR, 'scrfd_10g_bnkps.onnx')
MBF_ONNX    = os.path.join(NOTEBOOKS_DIR, 'w600k_mbf.onnx')
SCRFD_OUT   = os.path.join(OUTPUT_DIR, 'scrfd.tflite')
MBF_OUT     = os.path.join(OUTPUT_DIR, 'mobilefacenet.tflite')


def simplify_onnx(input_path: str, output_path: str, input_shape_str: str) -> str:
    """
    Run onnxsim (ONNX model simplifier) to fold constants, remove unused ops,
    and make the graph friendlier to TFLite converters.
    """
    try:
        import onnxsim
        import onnx
        print(f"  Simplifying ONNX graph with onnxsim (shape {input_shape_str}) ...")
        
        # We use the CLI via subprocess to easily pass --input-shape
        import subprocess
        cmd = [sys.executable, '-m', 'onnxsim', input_path, output_path, '--input-shape', input_shape_str]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode == 0:
            print("  ✅ ONNX graph simplified.")
            return output_path
        else:
            print(f"  ⚠️  onnxsim failed: {res.stderr}\nProceeding with original.")
            return input_path
    except Exception as e:
        print(f"  ℹ️  onnxsim error: {e} — skipping simplification.")
        return input_path


def convert_with_onnx2tf(onnx_path: str, tflite_out_path: str, model_name: str):
    """Convert ONNX → TFLite using onnx2tf."""
    import onnx2tf

    out_dir = os.path.join(tempfile.gettempdir(), f'{model_name}_onnx2tf')
    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)

    print(f"  Running onnx2tf → {out_dir} ...")
    onnx2tf.convert(
        input_onnx_file_path=onnx_path,
        output_folder_path=out_dir,
        copy_onnx_input_output_names_to_tflite=True,
        non_verbose=True,
    )

    tflite_files = [f for f in os.listdir(out_dir) if f.endswith('.tflite')]
    if not tflite_files:
        raise RuntimeError(f"No .tflite found in {out_dir}")

    # Pick the largest (float32) tflite
    tflite_files.sort(key=lambda f: os.path.getsize(os.path.join(out_dir, f)), reverse=True)
    shutil.copy2(os.path.join(out_dir, tflite_files[0]), tflite_out_path)
    mb = os.path.getsize(tflite_out_path) / 1024 / 1024
    print(f"  ✅ {mb:.1f} MB → {tflite_out_path}")


def convert_scrfd():
    """Convert SCRFD face detector ONNX → TFLite."""
    if os.path.exists(SCRFD_OUT):
        print(f"⏭️  scrfd.tflite already exists ({os.path.getsize(SCRFD_OUT)//1024} KB)")
        return

    print(f"\n{'='*60}")
    print("Converting SCRFD-2.5G")

    # Try onnxsim simplification first
    simplified = os.path.join(tempfile.gettempdir(), 'scrfd_simplified.onnx')
    # Use input.1 as the tensor name since that's what SCRFD uses. (Often it's input.1 or data)
    onnx_to_use = simplify_onnx(SCRFD_ONNX, simplified, 'input.1:1,3,640,640')

    try:
        convert_with_onnx2tf(onnx_to_use, SCRFD_OUT, 'scrfd')
    except Exception as e:
        print(f"  ⚠️  onnx2tf failed: {e}")
        print("  Trying fallback: onnxruntime → numpy inference mode ...")
        scrfd_fallback(SCRFD_OUT)


def scrfd_fallback(out_path: str):
    """
    Fallback: export a minimal TFLite model that wraps the SCRFD
    ONNX model's output via onnxruntime session. This is for cases
    where the full graph conversion fails due to unsupported ops.
    
    In practice this produces a TFLite function that calls out to
    an ORT session — only works if you embed ORT in the app, so this
    is not the preferred path. We raise here so the user knows they
    need to handle this manually.
    """
    raise RuntimeError(
        "SCRFD conversion failed. The model uses dynamic shapes that are complex to convert.\n"
        "Manual steps:\n"
        "  1. Use https://netron.app to inspect scrfd_10g_bnkps.onnx\n"
        "  2. Export with fixed input shape: python -m onnxsim scrfd_10g_bnkps.onnx scrfd_fixed.onnx "
        "--input-shape 'input.1:1,3,640,640'\n"
        "  3. Re-run this script\n"
        "  Or download a pre-converted scrfd.tflite from: "
        "https://huggingface.co/datasets/snapsquad/models"
    )


def convert_mobilefacenet():
    """Convert MobileFaceNet ONNX → TFLite."""
    if os.path.exists(MBF_OUT):
        print(f"⏭️  mobilefacenet.tflite already exists ({os.path.getsize(MBF_OUT)//1024} KB)")
        return

    print(f"\n{'='*60}")
    print("Converting MobileFaceNet (w600k_mbf)")

    simplified = os.path.join(tempfile.gettempdir(), 'mbf_simplified.onnx')
    # The input for MobileFaceNet is typically 'input.1'
    onnx_to_use = simplify_onnx(MBF_ONNX, simplified, 'input.1:1,3,112,112')

    convert_with_onnx2tf(onnx_to_use, MBF_OUT, 'mobilefacenet')


if __name__ == '__main__':
    print("SnapSquad — ONNX → TFLite Model Converter")
    print(f"Source : {NOTEBOOKS_DIR}")
    print(f"Output : {OUTPUT_DIR}")

    for path, name in [(SCRFD_ONNX, 'scrfd_10g_bnkps.onnx'), (MBF_ONNX, 'w600k_mbf.onnx')]:
        if not os.path.exists(path):
            print(f"❌ Missing: {path}")
            sys.exit(1)

    # Install onnxsim if not present
    try:
        import onnxsim
    except ImportError:
        print("Installing onnxsim ...")
        import subprocess
        subprocess.run([sys.executable, '-m', 'pip', 'install', 'onnxsim'], check=True)

    convert_mobilefacenet()
    convert_scrfd()

    print("\n✅ Conversion complete!")
