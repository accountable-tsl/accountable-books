# ---- builder ----
FROM pgvector/pgvector:0.8.0-pg17 AS builder
ARG DEBIAN_FRONTEND=noninteractive
ARG PG_CRON_VERSION=v1.6.4
ARG PG_UUIDV7_VERSION=v1.5.0

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential git postgresql-server-dev-17 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# build pg_cron
RUN set -eux; \
  git clone https://github.com/citusdata/pg_cron.git /tmp/pg_cron; \
  cd /tmp/pg_cron; \
  git checkout "${PG_CRON_VERSION}"; \
  make && make install

# build pg_uuidv7
RUN set -eux; \
  git clone https://github.com/fboulnois/pg_uuidv7.git /tmp/pg_uuidv7; \
  cd /tmp/pg_uuidv7; \
  git checkout "${PG_UUIDV7_VERSION}"; \
  make && make install

# ---- final ----
FROM pgvector/pgvector:0.8.0-pg17

# copy only built artifacts
COPY --from=builder /usr/lib/postgresql/17/lib/pg_cron.so /usr/lib/postgresql/17/lib/
COPY --from=builder /usr/share/postgresql/17/extension/pg_cron* /usr/share/postgresql/17/extension/
COPY --from=builder /usr/lib/postgresql/17/lib/pg_uuidv7.so /usr/lib/postgresql/17/lib/
COPY --from=builder /usr/share/postgresql/17/extension/pg_uuidv7* /usr/share/postgresql/17/extension/

# auto-create extensions on first init
COPY 00-extensions.sql /docker-entrypoint-initdb.d/00-extensions.sql

# custom entrypoint wrapper
COPY --chmod=0755 entrypoint.sh /usr/local/bin/custom-entrypoint.sh

# Use the custom entrypoint
ENTRYPOINT ["/usr/local/bin/custom-entrypoint.sh"]
CMD ["postgres"]

LABEL maintainer="tech@getaccountable.com" \
      version="1.0" \
      description="PostgreSQL 17 with pg_cron, pg_uuidv7, and pgvector"
