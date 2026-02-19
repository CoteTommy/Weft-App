# Incident Triage Runbook

## 1. Capture Baseline

1. Record app version, OS, and profile.
2. Capture runtime metrics from Settings > Interop/Performance view.
3. Export latest local health snapshot and logs.

## 2. Classify by Symptom

- Runtime startup failure: classify as `runtime_unavailable`.
- Slow responses/timeouts: classify as `upstream_timeout`.
- Invalid payload/user inputs: classify as `validation`.
- Local persistence capacity errors: classify as `storage_quota`.
- Unknown faults: classify as `internal`.

## 3. Triage Checklist

1. Confirm profile + RPC alignment.
2. Confirm runtime status transitions (start/stop/restart).
3. Check queue backlog and failed message reasons.
4. Check index freshness (`index_last_sync_ms`) and thread/message counts.
5. Verify attachment handle cleanup behavior.

## 4. Recovery Actions

1. Retry daemon restart with explicit profile/rpc.
2. Force index reindex.
3. Pause and resume offline queue processing.
4. Reduce attachment preview mode to `on_demand` for memory pressure.

## 5. Escalation

Escalate when any condition is true:

- Reproducible crash or data-loss risk.
- Startup failure persists after restart + profile validation.
- Performance regression breaches defined p95 thresholds.

Attach:

- Runtime health snapshot JSON.
- Perf artifacts (`reports/perf/*.json`).
- Relevant logs and commit SHA.
