"""
OCR test script — runs the experimental ocr.py on an image and writes the
extracted text to an incrementing output file (ocr_output_1.txt, ...) so
previous results are never overwritten.

Usage:
    python run_ocr.py <image_path>

Example:
    python run_ocr.py ../../Images/menu.jpg
"""

import sys
import os

# Use the local experimental ocr.py
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ocr import extract_text_from_image


def next_output_path(directory: str) -> str:
    """Return the next incremented output path, e.g. ocr_output_3.txt."""
    i = 1
    while True:
        path = os.path.join(directory, f"ocr_output_{i}.txt")
        if not os.path.exists(path):
            return path
        i += 1


def run_ocr(image_path: str) -> str:
    """Run the experimental OCR on *image_path*."""
    print("Loading EasyOCR reader (first run downloads models, may take a moment)...")
    with open(image_path, "rb") as f:
        image_data = f.read()
    return extract_text_from_image(image_data)


def main():
    if len(sys.argv) != 2:
        print("Usage: python run_ocr.py <image_path>")
        sys.exit(1)

    image_path = sys.argv[1]

    if not os.path.isfile(image_path):
        print(f"Error: file not found: {image_path}")
        sys.exit(1)

    print(f"Running OCR on: {image_path}")
    extracted = run_ocr(image_path)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = next_output_path(script_dir)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(f"Source image: {os.path.abspath(image_path)}\n")
        f.write(f"{'=' * 60}\n\n")
        f.write(extracted)
        f.write("\n")

    print(f"Extracted text written to: {output_path}")
    print(f"Total lines captured: {len(extracted.splitlines())}")


if __name__ == "__main__":
    main()
