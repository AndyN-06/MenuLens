# MenuLens

A full-stack web app that extracts text from restaurant menu photos using OCR.

## Current Status: Slice 1 Complete

**Slice 1** implements the OCR pipeline:
- Upload menu image (drag & drop or file picker)
- Extract text using EasyOCR
- Display results in a collapsible view

## Tech Stack

- **Backend**: FastAPI (Python 3.11), EasyOCR
- **Frontend**: React 18, Vite
- **Deployment**: Docker, Docker Compose

## Project Structure

```
menulens/
├── docker-compose.yml
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── __init__.py
│       ├── main.py          # FastAPI app with /health and /api/ocr endpoints
│       └── ocr.py           # EasyOCR wrapper
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx          # Main app with stage machine
        ├── index.css        # Dark editorial design system
        └── components/
            ├── Uploader.jsx    # Drag/drop uploader with stage-aware labels
            └── OcrResult.jsx   # Collapsible OCR results display
```

## Getting Started

### Option 1: Docker (Recommended)

1. **Start the backend with Docker Compose**:
   ```bash
   cd menulens
   docker-compose up --build
   ```

   The backend will be available at http://localhost:8000

2. **Install frontend dependencies and start dev server**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   The frontend will be available at http://localhost:5173

### Option 2: Local Development (Without Docker)

**Backend**:
```bash
cd menulens/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend**:
```bash
cd menulens/frontend
npm install
npm run dev
```

## API Endpoints

### GET /health
Basic health check.

**Response**:
```json
{
  "status": "ok",
  "service": "menulens-backend"
}
```

### POST /api/ocr
Extract text from an uploaded menu image.

**Request**: multipart/form-data with `file` field

**Response**:
```json
{
  "filename": "menu.jpg",
  "text": "Extracted text here...",
  "char_count": 523
}
```

## Usage

1. Open http://localhost:5173 in your browser
2. Upload a menu photo (drag & drop or click to browse)
3. Wait for OCR processing (10-30 seconds)
4. View the extracted text results
5. Upload another menu to try again

## Notes

- **First OCR call may be slow** as EasyOCR downloads language models on first use
- **Image quality matters**: Clear, well-lit photos with legible text work best
- **No authentication**: This is an MVP focused on the core OCR functionality

## Next Steps (Future Slices)

- **Slice 2**: LLM parsing (convert raw OCR text → structured dish JSON)
- **Slice 3**: Taste profile onboarding + PostgreSQL persistence
- **Slice 4**: Personalized dish ranking using user preferences

## Design System

The frontend uses a dark editorial theme with:
- Colors: Dark backgrounds (#0d0d0d) with gold accents (#e8c97a)
- Fonts: DM Serif Display (headings), Outfit (body), DM Mono (code/data)
- All design tokens defined in `frontend/src/index.css`

---

Built with FastAPI, React, and EasyOCR
