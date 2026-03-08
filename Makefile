SHELL := /usr/bin/env bash

.PHONY: up down logs db-migrate db-shell reset-db api-install api-start admin-install admin-start mobile-install mobile-start mobile-web install all demo-up demo-up-root demo-status demo-stop

up:
	docker compose -f infra/docker-compose.yml up -d

down:
	docker compose -f infra/docker-compose.yml down

logs:
	docker compose -f infra/docker-compose.yml logs -f

db-migrate:
	./scripts/bootstrap-db.sh

db-shell:
	docker exec -it social-plans-db psql -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}"

reset-db:
	docker compose -f infra/docker-compose.yml down -v
	$(MAKE) up
	$(MAKE) db-migrate

api-install:
	npm install --prefix apps/api

api-start:
	node apps/api/index.js

admin-install:
	npm install --prefix apps/admin

admin-start:
	npm run dev --prefix apps/admin

mobile-install:
	npm install --prefix apps/mobile

mobile-start:
	cd apps/mobile && npm run start

mobile-web:
	cd apps/mobile && EXPO_PUBLIC_API_URL=http://localhost:3001 npm run web -- --host lan --port 19006

install:
	$(MAKE) api-install
	$(MAKE) admin-install
	$(MAKE) mobile-install

all:
	@echo "Usa: make demo-up"

demo-up:
	@mkdir -p logs
	@mkdir -p /tmp/social-plans-pids
	@test -f .env || (cp .env.example .env && echo "Creado .env desde .env.example")
	@printf "Levantando base de datos...\n"
	$(MAKE) up
	@printf "Esperando base de datos y aplicando esquema...\n"
	@PG_USER="$$( [ -n "$$POSTGRES_USER" ] && echo "$$POSTGRES_USER" || grep '^POSTGRES_USER=' .env 2>/dev/null | cut -d= -f2 || echo plansocial )"; \
	PG_DB="$$( [ -n "$$POSTGRES_DB" ] && echo "$$POSTGRES_DB" || grep '^POSTGRES_DB=' .env 2>/dev/null | cut -d= -f2 || echo plansocial )"; \
	for i in $(shell seq 1 40); do \
	  if docker compose -f infra/docker-compose.yml exec -T db pg_isready -U "$$PG_USER" -d "$$PG_DB" >/dev/null 2>&1; then \
	    break; \
	  fi; \
	  sleep 1; \
	done
	$(MAKE) db-migrate
	@printf "Instalando dependencias (si hace falta)...\n"
	$(MAKE) install
	@printf "Arrancando servicios...\n"
	@nohup node apps/api/index.js > logs/api.log 2>&1 & echo $$! > /tmp/social-plans-pids/api.pid
	@nohup npm run dev --prefix apps/admin > logs/admin.log 2>&1 & echo $$! > /tmp/social-plans-pids/admin.pid
	@nohup sh -c "cd apps/mobile && npm run start" > logs/mobile.log 2>&1 & echo $$! > /tmp/social-plans-pids/mobile.pid
	@printf "Demo iniciado.\n"
	@printf "API:    http://localhost:3001/health\n"
	@printf "Admin:  http://localhost:4000\n"
	@printf "Expo:  http://localhost:8081\n"
	@printf "Logs: logs/api.log | logs/admin.log | logs/mobile.log\n"

demo-up-root:
	POSTGRES_USER=root POSTGRES_PASSWORD=root POSTGRES_DB=plansocial ADMIN_TOKEN=root make demo-up

demo-status:
	@printf "API\n"
	@ps -p $$(cat /tmp/social-plans-pids/api.pid 2>/dev/null) >/dev/null 2>&1 && echo OK || echo OFF
	@printf "Admin\n"
	@ps -p $$(cat /tmp/social-plans-pids/admin.pid 2>/dev/null) >/dev/null 2>&1 && echo OK || echo OFF
	@printf "Mobile\n"
	@ps -p $$(cat /tmp/social-plans-pids/mobile.pid 2>/dev/null) >/dev/null 2>&1 && echo OK || echo OFF
	@printf "DB\n"
	@docker compose -f infra/docker-compose.yml ps

demo-stop:
	-@[ -f /tmp/social-plans-pids/api.pid ] && kill $$(cat /tmp/social-plans-pids/api.pid) || true
	-@[ -f /tmp/social-plans-pids/admin.pid ] && kill $$(cat /tmp/social-plans-pids/admin.pid) || true
	-@[ -f /tmp/social-plans-pids/mobile.pid ] && kill $$(cat /tmp/social-plans-pids/mobile.pid) || true
	@rm -f /tmp/social-plans-pids/*.pid
