.PHONY: up down db test test-inventory test-orders test-web smoke logs

up: ## Build and start everything, then open http://localhost:4200
	docker compose up -d --build

down: ## Stop everything and delete the database volume
	docker compose down -v

db: ## Start only PostgreSQL, for running the test suites or a service from an IDE
	docker compose up -d postgres

test: test-inventory test-orders test-web ## Run every test suite (start the database first with: make db)

test-inventory:
	cd inventory-service && mvn -B verify

test-orders:
	cd order-service && python -m pytest

test-web:
	cd web && npm ci && npm test -- --watch=false

smoke: ## Order, retry, reject, and cancel against the running stack
	bash scripts/smoke-test.sh

logs:
	docker compose logs -f
