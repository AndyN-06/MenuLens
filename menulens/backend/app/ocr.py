"""
OCR module using the local EasyOCR source (MenuRec/EasyOCR, v1.7.2).

The local source's reformat_input() handles raw bytes natively via
numpy frombuffer + cv2.imdecode, so no PIL preprocessing pipeline is needed.
mag_ratio replaces manual upscaling; adjust_contrast replaces manual PIL
contrast enhancement.
"""

import logging
from typing import Union

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.3

_reader = None


def _get_reader():
    """Get or create the singleton EasyOCR Reader."""
    global _reader
    if _reader is None:
        import easyocr
        _reader = easyocr.Reader(['en'], gpu=False, verbose=False)
    return _reader


def extract_text_from_image(image_data: Union[bytes, str]) -> str:
    """
    Extract text from an image using EasyOCR.

    Args:
        image_data: Raw image bytes or a file path string.

    Returns:
        Extracted text as a newline-joined string of confident detections.
    """
    reader = _get_reader()

    results = reader.readtext(
        image_data,
        paragraph=False,      # keep individual boxes — better for menu columns
        text_threshold=0.5,   # lower than default to catch faint text
        low_text=0.3,
        width_ths=0.7,
        add_margin=0.1,
        mag_ratio=1.5,        # scale up internally for small menu text
        adjust_contrast=0.5,  # auto-enhance low-contrast images
        contrast_ths=0.1,
    )

    for (bbox, text, confidence) in results:
        logger.info(f"  [{confidence:.2f}] {text!r}")

    return '\n'.join(
        text
        for (bbox, text, confidence) in results
        if confidence >= CONFIDENCE_THRESHOLD
    )
