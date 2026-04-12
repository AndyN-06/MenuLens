"""
Unit tests for the experimental OCR column-detection logic in test/ocr.py.

Tests cover:
  - Bounding-box helper functions
  - _find_column_boundaries  (single-column, two-column, three-column, edge cases)
  - _assign_to_columns       (normal items, full-width items, top-to-bottom sort)
  - extract_text_from_image  (mocked reader — no EasyOCR / GPU required)

Run from the test directory:
    pytest test_ocr_logic.py -v
"""

import os
import sys
import pytest
from unittest.mock import patch, MagicMock

# Use the local experimental ocr.py, not the backend
sys.path.insert(0, os.path.dirname(__file__))

import ocr as ocr_module
from ocr import (
    _bbox_left_x,
    _bbox_right_x,
    _bbox_top_y,
    _bbox_center_x,
    _bbox_width,
    _find_column_boundaries,
    _assign_to_columns,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def bbox(x0, y0, x1, y1):
    """Create a 4-point bounding box [[x0,y0],[x1,y0],[x1,y1],[x0,y1]]."""
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]


def result(x0, y0, x1, y1, text="word", conf=0.9):
    """Create a (bbox, text, confidence) tuple."""
    return (bbox(x0, y0, x1, y1), text, conf)


# ---------------------------------------------------------------------------
# Bbox helpers
# ---------------------------------------------------------------------------

class TestBboxHelpers:
    B = bbox(10, 20, 90, 80)

    def test_left_x(self):
        assert _bbox_left_x(self.B) == 10

    def test_right_x(self):
        assert _bbox_right_x(self.B) == 90

    def test_top_y(self):
        assert _bbox_top_y(self.B) == 20

    def test_center_x(self):
        assert _bbox_center_x(self.B) == 50.0

    def test_width(self):
        assert _bbox_width(self.B) == 80

    def test_non_axis_aligned_bbox(self):
        # Slightly rotated box — helpers should still find extremes
        b = [[10, 5], [95, 3], [92, 85], [7, 87]]
        assert _bbox_left_x(b) == 7
        assert _bbox_right_x(b) == 95
        assert _bbox_top_y(b) == 3


# ---------------------------------------------------------------------------
# _find_column_boundaries
# ---------------------------------------------------------------------------

class TestFindColumnBoundaries:

    def test_empty_returns_no_boundaries(self):
        assert _find_column_boundaries([], 1000) == []

    def test_fewer_than_4_eligible_returns_no_boundaries(self):
        items = [result(100, 10, 200, 50), result(110, 60, 210, 100)]
        assert _find_column_boundaries(items, 1000) == []

    def test_single_column_no_boundary(self):
        # All items clustered around cx ~150 — gap << 15% of 1000px
        items = [
            result(100, y, 200, y + 40)
            for y in range(0, 200, 40)
        ]
        assert _find_column_boundaries(items, 1000) == []

    def test_two_columns_detected(self):
        # Left column cx ~150, right column cx ~750; gap ~600px >> 150px threshold
        left  = [result(100, y, 200, y + 40) for y in range(0, 160, 40)]  # 4 items
        right = [result(700, y, 800, y + 40) for y in range(0, 160, 40)]  # 4 items
        boundaries = _find_column_boundaries(left + right, 1000)
        assert len(boundaries) == 1
        # Boundary should sit between left (cx=150) and right (cx=750)
        assert 200 < boundaries[0] < 700

    def test_three_columns_detected(self):
        # cx clusters at ~100, ~500, ~900 on a 1000px image
        c1 = [result( 75, y, 125, y + 30) for y in range(0, 120, 30)]
        c2 = [result(475, y, 525, y + 30) for y in range(0, 120, 30)]
        c3 = [result(875, y, 925, y + 30) for y in range(0, 120, 30)]
        boundaries = _find_column_boundaries(c1 + c2 + c3, 1000)
        assert len(boundaries) == 2
        assert boundaries[0] < 500 < boundaries[1]

    def test_full_width_items_excluded_from_gap_detection(self):
        # A full-width header spanning x=0..900 should not mask the two-column gap
        left   = [result(100, y, 200, y + 40) for y in range(0, 160, 40)]
        right  = [result(700, y, 800, y + 40) for y in range(0, 160, 40)]
        header = [result(  0, 200, 900, 240, text="MENU HEADER")]  # width=900 >= 55% of 1000
        boundaries = _find_column_boundaries(left + right + header, 1000)
        assert len(boundaries) == 1

    def test_gap_just_below_threshold_is_single_column(self):
        # Gap of exactly 14% of image_width (< 15% threshold)
        # image_width=1000, threshold=150px; place items so max gap ~140px
        items = [result(x, 0, x + 30, 40) for x in [0, 100, 200, 340]]
        # centers: 15, 115, 215, 355 → gaps: 100, 100, 140 — all < 150
        assert _find_column_boundaries(items, 1000) == []


# ---------------------------------------------------------------------------
# _assign_to_columns
# ---------------------------------------------------------------------------

class TestAssignToColumns:

    def test_two_columns_basic_assignment(self):
        left  = [result(100, y, 200, y + 40, text=f"L{i}") for i, y in enumerate(range(0, 160, 40))]
        right = [result(700, y, 800, y + 40, text=f"R{i}") for i, y in enumerate(range(0, 160, 40))]
        boundary = [450.0]
        cols = _assign_to_columns(left + right, boundary, 1000)

        assert len(cols) == 2
        left_texts  = [t for (_, t, _) in cols[0]]
        right_texts = [t for (_, t, _) in cols[1]]
        assert all(t.startswith("L") for t in left_texts)
        assert all(t.startswith("R") for t in right_texts)

    def test_full_width_item_assigned_by_left_edge(self):
        # Header spans the whole image (x=0..900); left_x=0 → should go to col 0
        header = result(0, 0, 900, 40, text="HEADER")
        left   = [result(100, y, 200, y + 30) for y in [50, 80]]
        right  = [result(700, y, 800, y + 30) for y in [50, 80]]
        boundary = [450.0]
        cols = _assign_to_columns([header] + left + right, boundary, 1000)
        col0_texts = [t for (_, t, _) in cols[0]]
        assert "HEADER" in col0_texts

    def test_full_width_item_in_right_column_by_left_edge(self):
        # Header starts at x=500, boundary at 450 → should land in col 1
        header = result(500, 0, 950, 40, text="RIGHT HEADER")
        left   = [result(100, y, 200, y + 30) for y in [50, 80, 110, 140]]
        right  = [result(700, y, 800, y + 30) for y in [50, 80, 110, 140]]
        boundary = [450.0]
        cols = _assign_to_columns([header] + left + right, boundary, 1000)
        col1_texts = [t for (_, t, _) in cols[1]]
        assert "RIGHT HEADER" in col1_texts

    def test_items_sorted_top_to_bottom_within_column(self):
        # Provide items out of y-order; expect them sorted after assignment
        items = [
            result(100, 200, 200, 240, text="bottom"),
            result(100,  50, 200,  90, text="top"),
            result(100, 120, 200, 160, text="middle"),
            result(700,  50, 800,  90, text="R"),  # right col filler
            result(700,  90, 800, 130, text="R2"),
            result(700, 130, 800, 170, text="R3"),
            result(700, 170, 800, 210, text="R4"),
        ]
        boundary = [450.0]
        cols = _assign_to_columns(items, boundary, 1000)
        left_texts = [t for (_, t, _) in cols[0]]
        assert left_texts == ["top", "middle", "bottom"]

    def test_empty_results_yields_empty_columns(self):
        cols = _assign_to_columns([], [450.0], 1000)
        assert cols == [[], []]


# ---------------------------------------------------------------------------
# extract_text_from_image  (mocked reader)
# ---------------------------------------------------------------------------

def make_reader_mock(readtext_results):
    reader = MagicMock()
    reader.readtext.return_value = readtext_results
    return reader


class TestExtractTextFromImage:

    def _run(self, readtext_results, image_width=1000):
        with patch.object(ocr_module, '_get_reader', return_value=make_reader_mock(readtext_results)), \
             patch.object(ocr_module, '_get_image_width', return_value=float(image_width)):
            return ocr_module.extract_text_from_image(b"fake-image-bytes")

    def test_empty_results_returns_empty_string(self):
        assert self._run([]) == ""

    def test_all_below_confidence_returns_empty_string(self):
        items = [
            (bbox(100, 10, 200, 50), "low", 0.1),
            (bbox(100, 60, 200, 100), "also low", 0.2),
        ]
        assert self._run(items) == ""

    def test_single_column_joined_by_newline(self):
        items = [
            (bbox(100, 10, 200, 50),  "Burger",  0.9),
            (bbox(100, 60, 200, 100), "Fries",   0.95),
            (bbox(100, 110,200, 150), "Shake",   0.85),
        ]
        result_text = self._run(items)
        assert result_text == "Burger\nFries\nShake"
        assert "\n\n" not in result_text

    def test_single_column_sorted_top_to_bottom(self):
        # Provide out-of-order items
        items = [
            (bbox(100, 100, 200, 140), "Second", 0.9),
            (bbox(100,  10, 200,  50), "First",  0.9),
            (bbox(100, 200, 200, 240), "Third",  0.9),
        ]
        assert self._run(items) == "First\nSecond\nThird"

    def test_two_columns_separated_by_blank_line(self):
        # Left column cx=150, right column cx=750; image_width=1000
        left_items  = [(bbox(100, y, 200, y+40), f"L{i}", 0.9) for i, y in enumerate(range(0, 160, 40))]
        right_items = [(bbox(700, y, 800, y+40), f"R{i}", 0.9) for i, y in enumerate(range(0, 160, 40))]
        result_text = self._run(left_items + right_items, image_width=1000)
        parts = result_text.split("\n\n")
        assert len(parts) == 2
        assert all(t.startswith("L") for t in parts[0].splitlines())
        assert all(t.startswith("R") for t in parts[1].splitlines())

    def test_confidence_filtering_removes_low_conf(self):
        items = [
            (bbox(100, 10, 200, 50),  "Good",     0.9),
            (bbox(100, 60, 200, 100), "Bad",       0.1),
            (bbox(100, 110,200, 150), "Also good", 0.8),
        ]
        result_text = self._run(items)
        assert "Bad" not in result_text
        assert "Good" in result_text
        assert "Also good" in result_text

    def test_confidence_exactly_at_threshold_is_kept(self):
        items = [
            (bbox(100, 10, 200, 50), "Borderline", ocr_module.CONFIDENCE_THRESHOLD),
        ]
        assert "Borderline" in self._run(items)
