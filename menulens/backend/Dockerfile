FROM python:3.11-slim

WORKDIR /app

COPY menulens/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY menulens/backend/app/ ./app/

EXPOSE 8000

# No --reload: it is a development convenience that watches the filesystem and
# runs an extra supervisor process. Railway overrides this via startCommand, but
# the image default should not be the dev server either.
# For local development use docker-compose, which mounts the source and reloads.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
