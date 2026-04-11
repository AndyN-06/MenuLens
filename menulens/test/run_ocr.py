"""
OCR test script — runs EasyOCR on an image and writes the extracted text to an
incrementing output file (ocr_output_1.txt, ocr_output_2.txt, ...) so previous
results are never overwritten.

Usage:
    python run_ocr.py <image_path>

Example:
    python run_ocr.py ../Images/menu.jpg
"""

import sys
import os

# ---------------------------------------------------------------------------
# EasyOCR settings (mirrors the backend's ocr.py exactly)
# ---------------------------------------------------------------------------
CONFIDENCE_THRESHOLD = 0.3


def next_output_path(directory: str) -> str:
    """Return the next incremented output path, e.g. ocr_output_3.txt."""
    i = 1
    while True:
        path = os.path.join(directory, f"ocr_output_{i}.txt")
        if not os.path.exists(path):
            return path
        i += 1


def run_ocr(image_path: str) -> str:
    """Load EasyOCR and extract text from *image_path*."""
    print("Loading EasyOCR reader (first run downloads models, may take a moment)...")
    import easyocr
    reader = easyocr.Reader(['en'], gpu=False, verbose=False)

    print(f"Running OCR on: {image_path}")
    results = reader.readtext(
        image_path,
        paragraph=False,
        text_threshold=0.5,
        low_text=0.3,
        width_ths=0.7,
        add_margin=0.1,
        mag_ratio=1.5,
        adjust_contrast=0.5,
        contrast_ths=0.1,
    )

    lines = []
    for (bbox, text, confidence) in results:
        status = "ok" if confidence >= CONFIDENCE_THRESHOLD else "low-conf"
        print(f"  [{confidence:.2f}] ({status}) {text!r}")
        if confidence >= CONFIDENCE_THRESHOLD:
            lines.append(text)

    return '\n'.join(lines)


def main():
    if len(sys.argv) != 2:
        print("Usage: python run_ocr.py <image_path>")
        sys.exit(1)

    image_path = sys.argv[1]

    if not os.path.isfile(image_path):
        print(f"Error: file not found: {image_path}")
        sys.exit(1)

    extracted = run_ocr(image_path)

    # Write to the next available output file in the same directory as this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = next_output_path(script_dir)

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(f"Source image: {os.path.abspath(image_path)}\n")
        f.write(f"{'=' * 60}\n\n")
        f.write(extracted)
        f.write('\n')

    print(f"\nExtracted text written to: {output_path}")
    print(f"Total lines captured: {len(extracted.splitlines())}")


if __name__ == '__main__':
    main()
