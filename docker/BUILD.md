## Build locally

PuggieType doesn't publish Docker images. Build them from this repo instead.

From the `docker/` directory (uses the `build:` settings in `docker-compose.yml`):

```
  docker compose build
```

Or by hand, from the repo root:

```
  docker buildx build --progress=plain --no-cache -t puggietype-backend:local . -f ./docker/backend/Dockerfile
  docker buildx build --progress=plain --no-cache -t puggietype-frontend:local . -f ./docker/frontend/Dockerfile
```

These tags are local only. Don't push them to a registry.
