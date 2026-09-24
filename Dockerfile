FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
# Sane torch defaults on CPU hosts; override per service.
ENV LAYA_THREADS=4 WAYFINDER_PRELOAD=0 WAYFINDER_MODELS=english
# Keep caches inside /app so the image can drop root before serving.
ENV HF_HOME=/app/.cache/huggingface

WORKDIR /app
COPY pyproject.toml README.md ./
COPY wayfinder/ wayfinder/
COPY docs/ docs/
COPY ui/ ui/
RUN pip install --upgrade pip && pip install -e . && python -c "import wayfinder; print('wayfinder ok')" \
 && useradd --create-home --uid 10001 appuser \
 && mkdir -p /app/data /app/.cache && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD python -c "import os,urllib.request,sys;sys.exit(0 if urllib.request.urlopen(f\"http://127.0.0.1:{os.environ.get('PORT','8000')}/health\").read() else 1)"
CMD ["sh", "-c", "uvicorn wayfinder.app:app --host 0.0.0.0 --port ${PORT:-8000} --no-server-header"]
