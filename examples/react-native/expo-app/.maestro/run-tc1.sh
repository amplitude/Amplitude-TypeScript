#!/usr/bin/env bash
#
# TC1 (offline queue -> reconnect flush) — adb-driven hybrid driver.
#
# Why this exists
# ---------------
# `tc1-offline-queue-flush.yaml` is the self-contained flow and uses Maestro's
# in-flow `setAirplaneMode`. On many Android *emulators* airplane mode does not
# reliably register as offline for this SDK: on API >= 23 the native connectivity
# checker requires NET_CAPABILITY_VALIDATED, and the emulator can keep reporting a
# validated network even in airplane mode. The trigger verified during manual TC1
# testing is, instead:
#
#       adb shell svc wifi disable && adb shell svc data disable
#
# Maestro cannot run adb/shell from inside a flow (its `runScript` is a JS sandbox,
# not a shell), so this script orchestrates the connectivity toggles *around*
# Maestro sub-flows. The phases run as separate `maestro test` invocations against
# the SAME running app process — only phase 1 launches/clears state; phases 2 and 3
# attach to the already-foregrounded app so the in-memory queue and the on-screen
# Queued/Uploaded counters survive across the toggles. Do NOT kill the app between
# phases.
#
# Usage
# -----
#   examples/react-native/expo-app/.maestro/run-tc1.sh
#
# The app must already be built and installed (with the deduped Metro config —
# `expo start --clear`) and a real AMPLITUDE_API_KEY inlined so the reconnect
# upload returns 200. Env overrides:
#   APP_ID      Android applicationId          (default: com.amplitude.expoapp)
#   ADB_SERIAL  target device/emulator serial  (default: adb's default device)
#
set -euo pipefail

APP_ID="${APP_ID:-com.amplitude.expoapp}"
ADB=(adb)
if [[ -n "${ADB_SERIAL:-}" ]]; then
  ADB=(adb -s "${ADB_SERIAL}")
fi

command -v adb >/dev/null     || { echo "error: adb not found on PATH"; exit 1; }
command -v maestro >/dev/null || { echo "error: maestro not found on PATH"; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"; echo "+ restoring connectivity"; "${ADB[@]}" shell svc wifi enable || true; "${ADB[@]}" shell svc data enable || true' EXIT

# --- phase flows (generated; kept tiny and adb-toggle-friendly) ---------------
cat >"${WORK}/phase1-online.yaml" <<YAML
appId: ${APP_ID}
---
# Online baseline: launch fresh, confirm online, send, confirm the queue drains.
- launchApp:
    clearState: true
- extendedWaitUntil:
    visible:
      text: "Home Screen"
    timeout: 30000
- extendedWaitUntil:
    visible:
      text: "Offline: false"
    timeout: 30000
- tapOn: "Online test"
- extendedWaitUntil:
    visible:
      text: "Queued: 0"
    timeout: 30000
YAML

cat >"${WORK}/phase2-offline.yaml" <<YAML
appId: ${APP_ID}
---
# App is already running and now offline (radios disabled by the driver). Events
# tracked here must QUEUE, not send. No launchApp: keep the JS state alive.
- extendedWaitUntil:
    visible:
      text: "Offline: true"
    timeout: 30000
- tapOn: "Offline test"
- tapOn: "Offline test"
- assertVisible:
    text: "Queued: 2"
- assertVisible:
    text: "Last: RN Expo Offline Test → queued (offline)"
YAML

cat >"${WORK}/phase3-flush.yaml" <<YAML
appId: ${APP_ID}
---
# Radios re-enabled by the driver: the SDK flushes the queued events on reconnect.
- extendedWaitUntil:
    visible:
      text: "Offline: false"
    timeout: 30000
- extendedWaitUntil:
    visible:
      text: "Queued: 0"
    timeout: 30000
- assertVisible:
    text: "Last: RN Expo Offline Test → 200 Event tracked successfully"
YAML

echo "+ phase 1: online baseline"
maestro test "${WORK}/phase1-online.yaml"

echo "+ going offline: svc wifi/data disable"
"${ADB[@]}" shell svc wifi disable
"${ADB[@]}" shell svc data disable
sleep 5

echo "+ phase 2: track while offline (must queue)"
maestro test "${WORK}/phase2-offline.yaml"

echo "+ reconnecting: svc wifi/data enable"
"${ADB[@]}" shell svc wifi enable
"${ADB[@]}" shell svc data enable
sleep 8

echo "+ phase 3: reconnect flush"
maestro test "${WORK}/phase3-flush.yaml"

echo "+ TC1 passed"
