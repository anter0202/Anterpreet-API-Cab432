# PixelSmith API (CAB432 A1)

Node.js/Express REST API with a CPU-intensive image processing pipeline (`sharp`), JWT auth with roles,
PostgreSQL for structured data (images/jobs), and local volume storage for unstructured files. Dockerised, ready
for ECR → EC2. Includes a tiny web client and load-test script.

## Quick start (local, Docker Compose)
```bash
cp .env.example .env
docker compose up --build
# API: http://localhost:8080/api/v1/healthz
# Client: http://localhost:8080/
```

## Hard-coded users (for A1)
- admin / adminpass (role: admin)
- user  / userpass  (role: user)

## Endpoints (high-level)
- POST   /api/v1/auth/login
- POST   /api/v1/images            (multipart upload: field name 'file')
- POST   /api/v1/images/import     (external API -> import random image)
- GET    /api/v1/images            (?owner=me&sort=created_at&order=desc&limit=20&page=1&format=jpeg)
- GET    /api/v1/images/:id
- GET    /api/v1/images/:id/download
- POST   /api/v1/jobs              ({ imageId, params })
- GET    /api/v1/jobs              (?status=processing&limit=10&page=1)
- GET    /api/v1/jobs/:id
- GET    /api/v1/admin/metrics     (admin only)

## Load testing
See `scripts/loadtest.sh` or try:
```bash
bash scripts/loadtest.sh http://localhost:8080 "<JWT>"
```

## Deploy (ECR → EC2, Ubuntu 24.04)
1. Build & push:
```bash
aws ecr get-login-password | docker login --username AWS --password-stdin <acct>.dkr.ecr.<region>.amazonaws.com
docker build -t pixelsmith:latest .
docker tag pixelsmith:latest <acct>.dkr.ecr.<region>.amazonaws.com/pixelsmith:latest
docker push <acct>.dkr.ecr.<region>.amazonaws.com/pixelsmith:latest
```
2. On EC2, set `.env`, then:
```bash
# docker-compose.yml's api.image should be your ECR image reference in prod
docker compose pull && docker compose up -d
```

## Notes
- Storage under `/data/images/{originals,processed}` (Docker volume `images`).
- Pagination headers: `X-Total-Count` and `Link` with `rel="next"|"prev"`.
- ETag/Cache-Control on downloads.
