# Performance Targets and Regression Checks

This document defines the baseline scenarios and acceptance thresholds for memory, startup, and idle behavior.

## Repro Scenarios

1. Seed deterministic indexed data:
   - `bun run perf:seed:index`
2. Query benchmark:
   - `bun run perf:bench:index`
3. Desktop interaction suite (startup, thread open, search, scroll):
   - `WEFT_INDEX_STORE_PATH="$(pwd)/.tmp/weft-bench-index.sqlite3" VITE_ENABLE_PERF_HARNESS=true bun run dev`
4. Idle CPU benchmark (5 minutes):
   - `bun run perf:bench:idle`

## Thresholds

1. Thread open p95: `< 100ms`
2. Search p95: `< 100ms`
3. Scroll slow-frame ratio: `< 10%`
4. Startup interactive: `< 1800ms`
5. Hidden/minimized idle CPU average over 5 minutes: `< 3%`
6. Files list payload reduction after metadata-first mode: `>= 80%`
7. Chat+idle JS heap reduction after paged hydration: `>= 40%`

## Runtime Metrics Command

Use `get_runtime_metrics` to capture:

1. `rss_bytes`
2. `db_size_bytes`
3. `queue_size`
4. `message_count`
5. `thread_count`

## Reporting

Store outputs in:

1. `reports/perf/index-query.json`
2. `reports/perf/interaction-suite.json`
3. `reports/perf/idle-cpu.json`
4. `reports/perf/runtime-metrics.json`
