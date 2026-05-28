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

loop-doctor:
    node --version || true
    npm --version || true
    ak repo show . || true
    ./scripts/rocs.sh --doctor || true
    git status --short -- . || true

loop-verify-fast:
    just check

loop-impact-plan:
    echo "loop-impact-plan: changed files under this repo:"
    git status --short -- . || true
    bash -c 'if git status --short -- . | grep -Eq "(^| )(package.json|package-lock.json|Justfile|packages/|apps/|scripts/)"; then echo "impact=normal"; echo "next=just loop-impact-run"; else echo "impact=bounded"; echo "next=just loop-impact-run"; fi'

loop-impact-run:
    just check

loop-impact-wide:
    echo "LOOP_WIDE_REASON=${LOOP_WIDE_REASON:-not-provided}"
    just ci

loop-landing-check:
    just ci

