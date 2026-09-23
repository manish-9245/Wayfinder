FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
# Keep torch thread use sane on CPU hosts; override per node.
ENV LAYA_THREADS=4 GATE_PRELOAD=1

WORKDIR /app
COPY pyproject.toml README.md ./
COPY gate/ gate/
COPY ui/ ui/
RUN pip install --upgrade pip && pip install -e ".[serve]" && python -c "import wayfinder; print('wayfinder ok')"

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD python -c "import urllib.request,sys;sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').read() else 1)"
CMD ["uvicorn", "wayfinder.app:app", "--host", "0.0.0.0", "--port", "8000"]
