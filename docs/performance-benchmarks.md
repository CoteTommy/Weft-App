# Performance Benchmark Harness

This project now includes a repeatable benchmark harness for the high-scale target:
- 100k messages baseline
- Thread open p95 `< 100ms`
- Search p95 `< 100ms` for query length `>= 3`
- Timeline slow-frame ratio `< 10%`
- Startup interactive `< 1.8s`
- Idle CPU `< 3%` average over 5 minutes

## 1) Seed a Deterministic 100k Indexed Dataset

```bash
bun run perf:seed:index
```

This writes a synthetic index DB at `.tmp/weft-bench-index.sqlite3`.

You can customize the generator:

```bash
bun scripts/perf/seed-index.mjs --messages 100000 --threads 500 --attachment-rate 0.08 --force --db .tmp/custom-bench.sqlite3
```

## 2) Run Indexed Query p95 Benchmarks (Thread Open + Search)

```bash
bun run perf:bench:index
```

Output is JSON with min/mean/p50/p95/p99 and pass/fail against the `<100ms` p95 target.

To run with custom iterations:

```bash
bun scripts/perf/index-query-bench.mjs --thread-iterations 300 --search-iterations 300 --search-terms status,relay,receipt,retry
```

## 3) Run Client Interaction Benchmarks (Startup + Thread Open + Search + Scroll)

Launch desktop with harness enabled and the seeded index path:

```bash
WEFT_INDEX_STORE_PATH="$(pwd)/.tmp/weft-bench-index.sqlite3" VITE_ENABLE_PERF_HARNESS=true bun run dev
```

In the desktop DevTools console, open `/chats/<thread-id>` and run:

```js
await window.__WEFT_PERF__.runInteractionSuite()
```

Available granular methods:

```js
await window.__WEFT_PERF__.runThreadOpenBenchmark({ samples: 40, warmup: 10 })
await window.__WEFT_PERF__.runMessageSearchBenchmark({ samples: 40, warmup: 10 })
await window.__WEFT_PERF__.runScrollBenchmark({ durationMs: 15000 })
window.__WEFT_PERF__.startupInteractiveMs()
```

The suite returns pass/fail checks for:
- `threadOpen.p95Ms < 100`
- `search.p95Ms < 100`
- `scroll.slowFramePercent < 10`
- `startupInteractiveMs < 1800`

## 4) Run 5-Minute Idle CPU Benchmark

Keep the app connected and idle, then run:

```bash
bun run perf:bench:idle
```

Default process match pattern:
- `weft|reticulum|lxmf`

Custom pattern example:

```bash
scripts/perf/idle-cpu-sample.sh --seconds 300 --match 'weft-desktop|reticulumd' --target 3
```

## 5) Suggested Reporting Format

Store benchmark output in CI artifacts or local reports:
- `reports/perf/index-query.json`
- `reports/perf/interaction-suite.json`
- `reports/perf/idle-cpu.json`

Example:

```bash
mkdir -p reports/perf
bun run perf:bench:index > reports/perf/index-query.json
```

## Notes

- The benchmark harness is additive and does not remove any existing runtime commands.
- Index query telemetry logs are emitted by backend commands (`index_query`, `index_status`, `index_reindex`, `event_pump`).
- For deterministic comparisons, keep hardware, power mode, and runtime profile stable between runs.
