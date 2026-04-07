# obsidian-plugins Justfile — standardized command surface

help:
    just --list

test:
    npm run test

check:
    npm run check

lint:
    bash ./scripts/ci/smoke.sh

fmt:
    @echo "info: no canonical root formatter configured yet; package-local formatters remain authoritative"

ci:
    npm run ci

doctor:
    npm run doctor
