.PHONY: format lint fix check

VENV := .venv/bin

format:
	$(VENV)/ruff format app
	$(VENV)/ruff check app --select I --fix

format-check:
	$(VENV)/ruff format --check app

lint:
	$(VENV)/ruff check app

fix:
	$(VENV)/ruff check app --fix

check: format-check lint
