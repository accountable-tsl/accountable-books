
# pg version that includes pgvector
FROM pgvector/pgvector:0.8.0-pg17

RUN apt-get update \
    && apt-get install -y \
        build-essential \
        postgresql-server-dev-17 \
        git \
        wget \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install pg-cron
RUN git clone https://github.com/citusdata/pg_cron.git /tmp/pg_cron \
    && cd /tmp/pg_cron \
    && git checkout v1.6.4 \
    && make \
    && make install \
    && rm -rf /tmp/pg_cron

# Install pg_uuidv7
RUN git clone https://github.com/fboulnois/pg_uuidv7.git /tmp/pg_uuidv7 \
    && cd /tmp/pg_uuidv7 \
    && git checkout v1.6.0 \
    && make \
    && make install \
    && rm -rf /tmp/pg_uuidv7


# Configure PostgreSQL for pg-cron
RUN echo "shared_preload_libraries = 'pg_cron'" >> /usr/share/postgresql/postgresql.conf.sample
RUN echo "cron.database_name = 'accountable_books'" >> /usr/share/postgresql/postgresql.conf.sample

