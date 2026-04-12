"""
Experimental OCR module — development/optimization sandbox.

Uses the same EasyOCR reader as the backend but adds column-detection logic
on top.  Changes here do not affect the running web app.

Column detection:
  Multi-column menus are handled by clustering detected bounding boxes on
  their horizontal center-x positions rather than joining everything in
  raster (top-to-bottom) order.  The largest horizontal gap in the center-x
  distribution is used as the column boundary, making the split adaptive to
  the actual layout of each menu rather than relying on a fixed pixel threshold.
"""

import logging
import os
import sys
from typing import Union

# Use the local EasyOCR source at MenuLens/EasyOCR/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'EasyOCR'))

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.3

MIN_COLUMN_GAP_FRACTION = float(os.getenv("OCR_MIN_COLUMN_GAP", "0.05"))
FULL_WIDTH_FRACTION     = float(os.getenv("OCR_FULL_WIDTH_FRACTION", "0.55"))

_reader = None


# ---------------------------------------------------------------------------
# EasyOCR singleton
# ---------------------------------------------------------------------------

def _get_reader():
    global _reader
    if _reader is None:
        import easyocr
        _reader = easyocr.Reader(['en'], gpu=False, verbose=False)
    return _reader


# ---------------------------------------------------------------------------
# Bounding-box helpers
# ---------------------------------------------------------------------------

def _bbox_left_x(bbox) -> float:
    return min(pt[0] for pt in bbox)

def _bbox_right_x(bbox) -> float:
    return max(pt[0] for pt in bbox)

def _bbox_top_y(bbox) -> float:
    return min(pt[1] for pt in bbox)

def _bbox_center_x(bbox) -> float:
    return (_bbox_left_x(bbox) + _bbox_right_x(bbox)) / 2.0

def _bbox_width(bbox) -> float:
    return _bbox_right_x(bbox) - _bbox_left_x(bbox)


# ---------------------------------------------------------------------------
# Image width helper
# ---------------------------------------------------------------------------

def _get_image_width(image_data: Union[bytes, str]) -> float:
    try:
        import numpy as np
        import cv2
        if isinstance(image_data, bytes):
            arr = np.frombuffer(image_data, dtype=np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
        else:
            img = cv2.imread(str(image_data), cv2.IMREAD_GRAYSCALE)
        if img is not None:
            return float(img.shape[1])
    except Exception as exc:
        logger.debug(f"[OCR] _get_image_width failed ({exc}), using fallback 1000px")
    return 1000.0


# ---------------------------------------------------------------------------
# Column detection
# ---------------------------------------------------------------------------

def _find_column_boundaries(results: list, image_width: float) -> list[float]:
    """
    Find x-axis column boundaries by locating the largest gap in the
    distribution of bounding-box center-x values.

    Full-width boxes are excluded so headers don't mask the column gap.
    Recurses on each half to detect 3-column layouts.
    Returns a sorted list of boundary x-values; [] means single column.
    """
    full_width_threshold = FULL_WIDTH_FRACTION * image_width

    eligible = [r for r in results if _bbox_width(r[0]) < full_width_threshold]

    if len(eligible) < 4:
        return []

    centers = sorted(_bbox_center_x(r[0]) for r in eligible)

    gaps = [
        (centers[i + 1] - centers[i], (centers[i] + centers[i + 1]) / 2.0)
        for i in range(len(centers) - 1)
    ]
    largest_gap, boundary_x = max(gaps)

    min_gap_px = MIN_COLUMN_GAP_FRACTION * image_width
    if largest_gap < min_gap_px:
        logger.info(
            f"[OCR] largest center-x gap {largest_gap:.0f}px < threshold "
            f"{min_gap_px:.0f}px — single column"
        )
        return []

    logger.info(
        f"[OCR] column boundary at x={boundary_x:.0f}px "
        f"(gap={largest_gap:.0f}px, threshold={min_gap_px:.0f}px)"
    )

    left_results  = [r for r in results if _bbox_center_x(r[0]) <  boundary_x]
    right_results = [r for r in results if _bbox_center_x(r[0]) >= boundary_x]

    left_boundaries  = _find_column_boundaries(left_results,  image_width)
    right_boundaries = _find_column_boundaries(right_results, image_width)

    return sorted(left_boundaries + [boundary_x] + right_boundaries)


def _assign_to_columns(
    results: list,
    boundaries: list[float],
    image_width: float,
) -> list[list]:
    """
    Assign each text box to a column.

    Full-width boxes use their left edge for assignment (keeps section headers
    pinned to the column they introduce).  Normal boxes use center-x.
    Each column is sorted top-to-bottom.
    """
    num_columns = len(boundaries) + 1
    columns: list[list] = [[] for _ in range(num_columns)]

    full_width_threshold = FULL_WIDTH_FRACTION * image_width

    for result in results:
        bbox, text, conf = result
        if _bbox_width(bbox) >= full_width_threshold:
            x = _bbox_left_x(bbox)
        else:
            x = _bbox_center_x(bbox)

        col_idx = 0
        for i, bx in enumerate(boundaries):
            if x >= bx:
                col_idx = i + 1
        columns[col_idx].append(result)

    for col in columns:
        col.sort(key=lambda r: _bbox_top_y(r[0]))

    return columns


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_text_from_image(image_data: Union[bytes, str]) -> str:
    """
    Extract text from a menu image using EasyOCR with column-aware ordering.

    Single-column menus: plain newline-joined top-to-bottom.
    Multi-column menus: columns separated by a blank line.
    """
    reader = _get_reader()

    results = reader.readtext(
        image_data,
        paragraph=False,
        text_threshold=0.5,
        low_text=0.3,
        width_ths=0.7,
        add_margin=0.1,
        mag_ratio=1.5,
        adjust_contrast=0.5,
        contrast_ths=0.1,
    )

    for (bbox, text, confidence) in results:
        logger.info(f"  [{confidence:.2f}] {text!r}")

    confident = [
        (bbox, text, conf)
        for (bbox, text, conf) in results
        if conf >= CONFIDENCE_THRESHOLD
    ]

    if not confident:
        logger.warning("[OCR] no confident detections — returning empty string")
        return ""

    image_width = _get_image_width(image_data)
    logger.info(f"[OCR] {len(confident)} confident detections, image_width={image_width:.0f}px")

    boundaries = _find_column_boundaries(confident, image_width)

    if not boundaries:
        sorted_results = sorted(confident, key=lambda r: _bbox_top_y(r[0]))
        return "\n".join(text for (_, text, _) in sorted_results)

    columns = _assign_to_columns(confident, boundaries, image_width)

    logger.info(
        f"[OCR] {len(columns)} columns: "
        + ", ".join(f"col{i}={len(c)} boxes" for i, c in enumerate(columns))
    )

    column_texts = [
        "\n".join(text for (_, text, _) in col)
        for col in columns
        if col
    ]

    return "\n\n".join(column_texts)
