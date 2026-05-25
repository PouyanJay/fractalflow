# FractalFlow Studio — developer task runner.
# Thin, discoverable wrappers over the SvelteKit/npm toolchain.
# Run `make` (or `make help`) for the menu.

NPM       ?= npm
BASE_PATH ?= /fractalflow

# Colors (gracefully empty when stdout is not a TTY).
BOLD  := $(shell tput bold    2>/dev/null)
DIM   := $(shell tput dim     2>/dev/null)
CYAN  := $(shell tput setaf 6 2>/dev/null)
RESET := $(shell tput sgr0    2>/dev/null)

.DEFAULT_GOAL := help

##@ Run
.PHONY: run
run: ## Bootstrap (install deps if missing) and launch the app
	@[ -d node_modules ] || { printf "$(DIM)No dependencies found — installing…$(RESET)\n"; $(NPM) install; }
	@printf "$(BOLD)Launching FractalFlow Studio…$(RESET) $(DIM)(Ctrl-C to stop)$(RESET)\n"
	@$(NPM) run dev

##@ Setup
.PHONY: install
install: ## Install dependencies (clean, lockfile-exact)
	$(NPM) ci

.PHONY: browsers
browsers: ## Install the Playwright browser used by tests
	npx playwright install chromium

.PHONY: setup
setup: install browsers ## Install everything needed to develop and test

##@ Develop
.PHONY: dev
dev: ## Start the dev server with hot reload
	$(NPM) run dev

.PHONY: preview
preview: build ## Build, then serve the production bundle locally
	$(NPM) run preview

##@ Quality
.PHONY: check
check: ## Type-check the project (svelte-check)
	$(NPM) run check

.PHONY: lint
lint: ## Check formatting and lint (Prettier + ESLint)
	$(NPM) run lint

.PHONY: format
format: ## Auto-format the codebase with Prettier
	$(NPM) run format

.PHONY: verify
verify: check lint test ## Run every gate: types, lint, and tests

##@ Test
.PHONY: test
test: ## Run unit + end-to-end tests
	$(NPM) test

.PHONY: test-unit
test-unit: ## Run unit tests once (no watch)
	$(NPM) run test:unit -- --run

.PHONY: test-e2e
test-e2e: ## Run Playwright end-to-end tests
	$(NPM) run test:e2e

.PHONY: snapshots
snapshots: ## Update Playwright visual snapshots
	$(NPM) run test:e2e -- --update-snapshots

##@ Build
.PHONY: build
build: ## Build the static site
	$(NPM) run build

.PHONY: build-pages
build-pages: ## Build for GitHub Pages (sets BASE_PATH=/fractalflow)
	BASE_PATH=$(BASE_PATH) $(NPM) run build

##@ Maintenance
.PHONY: clean
clean: ## Remove build output and the SvelteKit cache
	rm -rf build .svelte-kit

.PHONY: clean-all
clean-all: clean ## Also remove node_modules
	rm -rf node_modules

##@ Help
.PHONY: help
help: ## Show this help
	@printf "\n$(BOLD)FractalFlow Studio$(RESET) $(DIM)— developer tasks$(RESET)\n"
	@printf "$(DIM)Usage: make <target>$(RESET)\n"
	@awk 'BEGIN {FS = ":.*## "} \
		/^##@/ { printf "\n$(BOLD)%s$(RESET)\n", substr($$0, 5); next } \
		/^[a-zA-Z0-9_.-]+:.*## / { printf "  $(CYAN)%-13s$(RESET) %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@printf "\n"
