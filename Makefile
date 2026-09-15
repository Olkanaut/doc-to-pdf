FRONTEND_PORT ?= 3002
BACKEND_PORT ?= 4000

.PHONY: install dev backend frontend build lint test

install:
	npm --prefix backend install
	npm --prefix frontend install

dev:
	@printf "Starting backend:  http://localhost:%s\n" "$(BACKEND_PORT)"
	@printf "Starting frontend: http://localhost:%s\n" "$(FRONTEND_PORT)"
	@(cd backend && PORT=$(BACKEND_PORT) npm run dev) & \
	backend_pid=$$!; \
	(cd frontend && npm run dev -- --port $(FRONTEND_PORT) --strictPort) & \
	frontend_pid=$$!; \
	trap 'kill $$backend_pid $$frontend_pid 2>/dev/null; wait $$backend_pid $$frontend_pid 2>/dev/null; exit 0' INT TERM; \
	while kill -0 $$backend_pid 2>/dev/null && kill -0 $$frontend_pid 2>/dev/null; do \
		sleep 1; \
	done; \
	kill $$backend_pid $$frontend_pid 2>/dev/null; \
	wait $$backend_pid $$frontend_pid

backend:
	cd backend && PORT=$(BACKEND_PORT) npm run dev

frontend:
	cd frontend && npm run dev -- --port $(FRONTEND_PORT) --strictPort

build:
	npm --prefix backend run build
	npm --prefix frontend run build

lint:
	npm --prefix frontend run lint

test:
	npm --prefix backend run test
