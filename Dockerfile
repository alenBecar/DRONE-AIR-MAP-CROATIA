FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends nginx curl ca-certificates \
 && rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled/default \
 && pip install --no-cache-dir shapely==2.0.6

ARG PMTILES_VERSION=1.31.2
RUN arch=$(dpkg --print-architecture); case "$arch" in amd64) a=x86_64;; arm64) a=arm64;; *) echo "unsupported $arch"; exit 1;; esac; \
    curl -fsSL "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_Linux_${a}.tar.gz" \
    | tar xz -C /usr/local/bin pmtiles

WORKDIR /app
COPY . .
RUN python3 tools/build_page.py server && sh tools/fetch_assets.sh web
COPY docker/nginx.conf /etc/nginx/nginx.conf

ENV DATA_DIR=/data BASEMAP_MAXZOOM=13 PYTHONUNBUFFERED=1
VOLUME /data
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD curl -fs http://127.0.0.1/healthz || exit 1
CMD ["sh", "/app/docker/entrypoint.sh"]
