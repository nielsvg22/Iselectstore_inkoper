# Local car routing; no dependency on a public, non-commercial demo endpoint.
FROM debian:bookworm-slim AS roads
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates osmium-tool && rm -rf /var/lib/apt/lists/*
WORKDIR /work
# Change deliberately when refreshing map data; app releases reuse this layer.
ARG MAP_REFRESH=2026-10-22
RUN --mount=type=secret,id=proxy_ca \
    set -eu; \
    if [ -s /run/secrets/proxy_ca ]; then export CURL_CA_BUNDLE=/run/secrets/proxy_ca; fi; \
    echo "Map refresh: ${MAP_REFRESH}"; \
    curl -fsSL --retry 3 --max-time 900 https://download.geofabrik.de/europe/netherlands-latest.osm.pbf -o netherlands-latest.osm.pbf; \
    curl -fsSL --retry 3 --max-time 60 https://download.geofabrik.de/europe/netherlands-latest.osm.pbf.md5 -o source.md5; \
    md5sum -c source.md5; \
    osmium tags-filter netherlands-latest.osm.pbf w/highway w/route=ferry r/type=restriction -o roads.osm.pbf; \
    cp source.md5 roads.source.md5; \
    rm netherlands-latest.osm.pbf source.md5

FROM ghcr.io/project-osrm/osrm-backend:v6.0.0 AS graph
COPY --from=roads /work/roads.osm.pbf /data/roads.osm.pbf
RUN osrm-extract --threads 1 -p /opt/car.lua /data/roads.osm.pbf \
    && osrm-partition --threads 1 /data/roads.osrm \
    && osrm-customize --threads 1 /data/roads.osrm \
    && rm /data/roads.osm.pbf

FROM ghcr.io/project-osrm/osrm-backend:v6.0.0
COPY --from=graph /data /data
COPY --from=roads /work/roads.source.md5 /data/roads.source.md5
EXPOSE 5000
CMD ["osrm-routed", "--algorithm", "mld", "--threads", "1", "/data/roads.osrm"]
