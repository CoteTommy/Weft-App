#!/usr/bin/env bash
set -euo pipefail

SECONDS_TOTAL=300
INTERVAL=1
PATTERN='weft|reticulum|lxmf'
TARGET_PCT=3

while [[ $# -gt 0 ]]; do
  case "$1" in
    --seconds)
      SECONDS_TOTAL="$2"
      shift 2
      ;;
    --interval)
      INTERVAL="$2"
      shift 2
      ;;
    --match)
      PATTERN="$2"
      shift 2
      ;;
    --target)
      TARGET_PCT="$2"
      shift 2
      ;;
    -h|--help)
      cat <<'HELP'
Usage: scripts/perf/idle-cpu-sample.sh [options]

Options:
  --seconds <n>   Sample duration in seconds (default: 300)
  --interval <n>  Sampling interval in seconds (default: 1)
  --match <regex> Process match regex (case-insensitive)
  --target <n>    Pass threshold percent (default: 3)
  --help          Show this help

Examples:
  scripts/perf/idle-cpu-sample.sh --seconds 300 --match 'weft|reticulumd'
  scripts/perf/idle-cpu-sample.sh --seconds 120 --target 2.5
HELP
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if ! [[ "$SECONDS_TOTAL" =~ ^[0-9]+$ ]] || ! [[ "$INTERVAL" =~ ^[0-9]+$ ]]; then
  echo "--seconds and --interval must be integers" >&2
  exit 2
fi

if [[ "$SECONDS_TOTAL" -le 0 ]] || [[ "$INTERVAL" -le 0 ]]; then
  echo "--seconds and --interval must be > 0" >&2
  exit 2
fi

sample_cpu() {
  ps -A -o %cpu=,command= | awk -v pat="$PATTERN" '
    BEGIN { IGNORECASE=1; sum=0 }
    $0 ~ pat { sum += $1 }
    END { printf "%.6f", sum }
  '
}

samples=0
total=0
peak=0
start_epoch=$(date +%s)

while true; do
  now_epoch=$(date +%s)
  elapsed=$((now_epoch - start_epoch))
  if [[ "$elapsed" -ge "$SECONDS_TOTAL" ]]; then
    break
  fi

  current=$(sample_cpu)
  total=$(awk -v a="$total" -v b="$current" 'BEGIN { printf "%.6f", a + b }')
  peak=$(awk -v a="$peak" -v b="$current" 'BEGIN { if (b > a) printf "%.6f", b; else printf "%.6f", a }')
  samples=$((samples + 1))

  sleep "$INTERVAL"
done

if [[ "$samples" -eq 0 ]]; then
  echo "No samples collected" >&2
  exit 1
fi

average=$(awk -v total="$total" -v samples="$samples" 'BEGIN { printf "%.6f", total / samples }')
pass=$(awk -v avg="$average" -v target="$TARGET_PCT" 'BEGIN { print (avg < target) ? "true" : "false" }')
escaped_pattern=$(printf '%s' "$PATTERN" | sed 's/\\/\\\\/g; s/"/\\"/g')

cat <<JSON
{
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "durationSeconds": $SECONDS_TOTAL,
  "intervalSeconds": $INTERVAL,
  "processMatch": "$escaped_pattern",
  "samples": $samples,
  "averageCpuPercent": $average,
  "peakCpuPercent": $peak,
  "targetAverageCpuPercent": $TARGET_PCT,
  "pass": $pass
}
JSON
