FROM python:3.11.13-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /service

COPY requirements.txt ./requirements.txt
RUN pip install --requirement requirements.txt

COPY aasopharma_mcp ./aasopharma_mcp

USER 65532:65532

EXPOSE 10000

CMD ["sh", "-c", "uvicorn aasopharma_mcp.server:create_app --factory --host 0.0.0.0 --port ${PORT:-10000} --proxy-headers --forwarded-allow-ips='*'"]
