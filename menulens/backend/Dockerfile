FROM python:3.11-slim

WORKDIR /app

# System deps for opencv
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install local EasyOCR source (MenuRec/EasyOCR) — this replaces the pip package
# and pulls in all EasyOCR dependencies (torch, torchvision, opencv, etc.)
COPY EasyOCR/ /easyocr_src/
RUN pip install --no-cache-dir /easyocr_src/

# Install remaining backend dependencies
COPY menulens/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download EasyOCR models so the first request isn't slow
RUN python -c "import easyocr; easyocr.Reader(['en'], gpu=False)"

COPY menulens/backend/app/ ./app/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
