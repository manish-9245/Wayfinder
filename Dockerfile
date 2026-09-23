FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
# Sane torch defaults on CPU hosts; override per service.
ENV LAYA_THREADS=4 WAYFINDER_PRELOAD=0 WAYFINDER_MODELS=english

WORKDIR /app
COPY pyproject.toml README.md ./
COPY wayfinder/ wayfinder/
COPY ui/ ui/
RUN pip install --upgrade pip && pip install -e . && python -c "import wayfinder; print('wayfinder ok')"

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD python -c "import os,urllib.request,sys;sys.exit(0 if urllib.request.urlopen(f\"http://127.0.0.1:{os.environ.get('PORT','8000')}/health\").read() else 1)"
CMD ["sh", "-c", "uvicorn wayfinder.app:app --host 0.0.0.0 --port ${PORT:-8000}"]
