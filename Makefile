FRONTEND_PORT ?= 3002
BACKEND_PORT ?= 4000
DOTS_ENV ?= .env

define with_env
set -a; [ ! -f "$(DOTS_ENV)" ] || . "$(DOTS_ENV)"; set +a;
endef

.PHONY: install install-ingest dev backend frontend build lint test

install:
	npm --prefix backend install
	npm --prefix frontend install
	$(MAKE) install-ingest

# PDF/DOCX import (backend/ingest, see backend/ingest/README.md): best-effort,
# never fails `make install` when python3 is missing — the rest of the app
# works fine without it, that route just answers 422.
install-ingest:
	@if command -v python3 >/dev/null 2>&1; then \
		echo "Setting up backend/ingest/.venv (PDF/DOCX import)..."; \
		python3 -m venv backend/ingest/.venv && \
		backend/ingest/.venv/bin/pip install --quiet --upgrade pip && \
		backend/ingest/.venv/bin/pip install --quiet -r backend/ingest/requirements.txt && \
		echo "backend/ingest/.venv ready."; \
	 else \
		echo "python3 not found: skipping backend/ingest/.venv (PDF/DOCX import disabled, see backend/ingest/README.md)."; \
	 fi

dev:
	@printf "Starting backend:  http://localhost:%s\n" "$(BACKEND_PORT)"
	@printf "Starting frontend: http://localhost:%s\n" "$(FRONTEND_PORT)"
	@$(with_env) \
	(cd backend && PORT=$(BACKEND_PORT) npm run dev) & \
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
	$(with_env) cd backend && PORT=$(BACKEND_PORT) npm run dev

frontend:
	$(with_env) cd frontend && npm run dev -- --port $(FRONTEND_PORT) --strictPort

build:
	$(with_env) npm --prefix backend run build
	$(with_env) npm --prefix frontend run build

lint:
	npm --prefix frontend run lint

test:
	npm --prefix backend run test
