#!/usr/bin/env bash
# Rauchtest für das Docker-Image (Dockerfile): bauen, starten, auf „healthy“ warten, dann prüfen –
# Lebenszeichen, CORS für die Web-Version, Dev-Login im Betrieb aus, Konto anlegen, Container ersetzen (Daten im Volume
# bleiben, die Anmeldung gilt weiter), läuft nicht als root, im Image nur dist/, node_modules/ und package.json.
#
# Aufruf im Ordner FoodTracker/server: npm run docker:smoke (braucht Docker und curl).
# DOCKER_BUILD_FLAGS gibt zusätzliche Argumente an docker build weiter (z. B. --network host hinter einem Proxy).
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE="foodtracker-server:smoke"
NAME="foodtracker-smoke-$$"
VOLUME="foodtracker-smoke-$$"
PORT="${SMOKE_PORT:-3990}"
BASE="http://127.0.0.1:${PORT}"

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() {
  echo "FEHLER: $*" >&2
  docker logs "$NAME" >&2 2>&1 || true
  exit 1
}

# JSON-Feld aus stdin lesen, z. B. json token oder json user.role
json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let v=JSON.parse(s);for(const k of process.argv[1].split("."))v=v?.[k];process.stdout.write(String(v))})' "$1"; }

start_container() {
  # Kurzes Intervall nur für den Test; das Dockerfile prüft alle 30 Sekunden.
  docker run -d --name "$NAME" -p "127.0.0.1:${PORT}:3000" -v "${VOLUME}:/app/data" \
    --health-interval=2s --health-start-period=20s \
    -e ALLOW_DEV_LOGIN=1 "$IMAGE" >/dev/null
  for _ in $(seq 1 60); do
    status="$(docker inspect -f '{{.State.Health.Status}}' "$NAME" 2>/dev/null || echo fehlt)"
    [ "$status" = "healthy" ] && return 0
    [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null)" = "true" ] || fail "Container läuft nicht mehr"
    sleep 1
  done
  fail "Container wird nicht healthy (zuletzt: ${status})"
}

echo "== Image bauen"
# shellcheck disable=SC2086 # DOCKER_BUILD_FLAGS darf mehrere Argumente enthalten
docker build ${DOCKER_BUILD_FLAGS:-} -t "$IMAGE" .

echo "== Inhalt des Images"
contents="$(docker run --rm --entrypoint sh "$IMAGE" -c 'ls -A /app | tr "\n" " "')"
[ "$contents" = "data dist node_modules package.json " ] || fail "unerwarteter Inhalt in /app: ${contents}"
docker run --rm --entrypoint sh "$IMAGE" -c 'test ! -e /app/node_modules/vitest && test ! -e /app/node_modules/typescript' \
  || fail "Werkzeuge zum Bauen bzw. Testen im Image"

echo "== Starten und auf den Health-Check warten"
start_container
[ "$(docker exec "$NAME" id -u)" != "0" ] || fail "Server läuft als root"

echo "== Lebenszeichen und /api/health"
[ "$(curl -fsS "${BASE}/api/health/live")" = '{"ok":true}' ] || fail "/api/health/live"
[ "$(curl -fsS "${BASE}/api/health" | json ok)" = "true" ] || fail "/api/health"

echo "== CORS: Web-Version auf GitHub Pages erlaubt, fremde Website nicht"
curl -fsS -D - -o /dev/null -H "Origin: https://bennitut.github.io" "${BASE}/api/health/live" | tr -d '\r' \
  | grep -qi '^access-control-allow-origin: https://bennitut.github.io$' || fail "CORS für https://bennitut.github.io fehlt"
if curl -fsS -D - -o /dev/null -H "Origin: https://evil.example" "${BASE}/api/health/live" | grep -qi '^access-control-allow-origin'; then
  fail "CORS erlaubt eine fremde Website"
fi

echo "== Dev-Login im Betrieb aus (trotz ALLOW_DEV_LOGIN=1)"
[ "$(curl -fsS "${BASE}/api/auth/config" | json dev)" = "false" ] || fail "Dev-Login ist an"
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"name":"Test"}' "${BASE}/api/auth/dev")" = "404" ] \
  || fail "/api/auth/dev antwortet"
logs="$(docker logs "$NAME" 2>&1)"
grep -q "ALLOW_DEV_LOGIN=1 gilt hier nicht" <<<"$logs" || fail "Startmeldung sagt nichts zum Dev-Login"
grep -q "Im Container:        Port 3000" <<<"$logs" || fail "Startmeldung ohne Port im Container"
grep -q "Browser (CORS):      localhost und eigenes Netz, dazu https://bennitut.github.io" <<<"$logs" || fail "Startmeldung ohne CORS"
! grep -q "Im WLAN" <<<"$logs" || fail "Startmeldung nennt WLAN-Adressen"

echo "== Konto anlegen"
token="$(curl -fsS -X POST -H 'Content-Type: application/json' \
  -d '{"email":"docker-smoke@example.org","password":"geheim-geheim-123","name":"Docker"}' "${BASE}/api/auth/register" | json token)"
[ -n "$token" ] && [ "$token" != "undefined" ] || fail "kein Token nach der Registrierung"

echo "== Container ersetzen – Daten im Volume bleiben"
docker rm -f "$NAME" >/dev/null
start_container
[ "$(curl -fsS -H "Authorization: Bearer ${token}" "${BASE}/api/auth/me" | json email)" = "docker-smoke@example.org" ] \
  || fail "Anmeldung nach dem Ersetzen des Containers verloren"

echo "== Beenden mit SIGTERM"
started="$(date +%s)"
docker stop "$NAME" >/dev/null
[ $(( $(date +%s) - started )) -lt 8 ] || fail "Server beendet sich nicht rasch auf SIGTERM"

echo "Docker-Rauchtest: alles grün."
