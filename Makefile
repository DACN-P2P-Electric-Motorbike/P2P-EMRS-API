.PHONY: dev prod down logs shell migrate rebuild clean

# --- DEVELOPMENT (Local with DB) ---
dev:
	@echo "Starting development environment (with local Postgres)..."
	docker compose up --build

dev-detach:
	@echo "Starting dev in detached mode..."
	docker compose up --build -d

# --- PRODUCTION (Cloud/VPS with RDS/Aiven) ---
prod:
	@echo "Pulling latest image and starting production environment..."
	@if [ ! -f .env ]; then echo "WARNING: missing .env file. Please copy from .env.example."; exit 1; fi
	docker compose -f docker-compose.prod.yml pull
	docker compose -f docker-compose.prod.yml up -d

# --- UTILITIES ---
down:
	@echo "Stopping all containers..."
	docker compose down
	docker compose -f docker-compose.prod.yml down

logs:
	docker compose logs -f app

logs-prod:
	docker compose -f docker-compose.prod.yml logs -f app

shell:
	docker compose exec app sh

migrate:
	docker compose exec app npx prisma migrate deploy

clean:
	@echo "Removing containers, networks, and untagged images..."
	docker compose down -v
	docker system prune -f
