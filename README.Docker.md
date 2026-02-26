# Docker Deployment Guide for P2P EMRS

This repository is fully Dockerized for both development and production.

## 1. Local Development
Development mode mounts your source code `src/` inside the container and uses `nest start --watch`. It also spins up a local PostgreSQL container automatically.

```bash
# Optional but recommended on first setup
cp .env.example .env

# Run development mode (App + PostgreSQL)
make dev
# or using npm:
npm run docker:dev
```
- App runs on port `3000` (auto hot-reload on save).
- Local Postgres runs on `5432` with volume persistence.


## 2. Production Deployment (VPS/Cloud via Docker Hub)
Production mode uses the image pre-built by GitHub Actions (CI/CD) or pushed manually to Docker Hub. No build step is needed on the VPS. 

1. Ensure the `DOCKER_USERNAME` property in your `.env` is matching your target Docker Hub username, and add your **Aiven PostgreSQL / AWS RDS** URL to the `DATABASE_URL` variable.
2. Run production mode:

```bash
make prod
# or using npm:
npm run docker:prod
```
- Docker will `pull` the lightweight image directly from Docker Hub.
- Nginx runs on port `80` facing the web.
- App internal port `3000` is consumed by Nginx.

## 3. CI/CD (GitHub Actions to Docker Hub)
Whenever you push to the `main` or `develop` branches, GitHub Actions will automatically:
1. Build the production multi-stage image.
2. Push it to `docker.io/<YOUR_DOCKERHUB_USERNAME>/p2p-emrs:latest`.

**Required GitHub Secrets:**
Go to your GitHub repository -> Settings -> Secrets and variables -> Actions, and add:
- `DOCKERHUB_USERNAME`: Your Docker Hub username.
- `DOCKERHUB_TOKEN`: An access token generated from Docker Hub (Account Settings -> Personal Access Tokens).

## Features Included
- **Multi-Stage Dockerfile**: Builds the app, filters out `devDependencies`, creates a secure (non-root) lightweight container.
- **Nginx Reverse Proxy**: Gzip compression, rate limiting (100r/s + burst), WebSocket support, security headers.
- **GitHub Actions (CI)**: Pushes built images automatically.
- **Hot-Reload Dev Volume**: Edits update the running Linux container instantly. 

## Utilities
```bash
make shell   # Jump into the running Docker container
make migrate # Run Prisma migrations against the DB
make down    # Tear down containers
```
