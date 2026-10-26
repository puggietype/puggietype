## Build locally

PuggieType doesn't publish Docker images. Build them from this repo instead.

You need Docker Compose v2 (the `docker compose` plugin). The old
`docker-compose` v1 binary isn't supported.

From the `docker/` directory (uses the `build:` settings in `docker-compose.yml`),
create `.env` first. Compose reads `docker/.env` and fails without it:

```
  cp example.env .env
  docker compose build
```

Or by hand, from the repo root:

```
  docker buildx build --progress=plain --no-cache -t puggietype-backend:local . -f ./docker/backend/Dockerfile
  docker buildx build --progress=plain --no-cache -t puggietype-frontend:local . -f ./docker/frontend/Dockerfile
```

These tags are local only. Don't push them to a registry.
