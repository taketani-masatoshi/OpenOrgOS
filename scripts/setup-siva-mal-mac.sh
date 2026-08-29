#!/usr/bin/env bash
# SiVa on MAL Mac — build / start / stop / print env (Track B BP2)
# Does NOT use open-eid official test docker-compose.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SIVA_DIR="$ROOT/services/siva"
SRC_DIR="$SIVA_DIR/src"
JAR_DIR="$SIVA_DIR/jars"
RUN_DIR="$SIVA_DIR/run"
PID_FILE="$RUN_DIR/siva.pid"
LOG_FILE="$RUN_DIR/siva.log"
# Pin a known tag; override with ORGOS_SIVA_GIT_REF
SIVA_REF="${ORGOS_SIVA_GIT_REF:-release-3.10.1}"
SIVA_PORT="${ORGOS_SIVA_PORT:-8080}"

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "$*"; }

ensure_dirs() {
  mkdir -p "$JAR_DIR" "$RUN_DIR"
}

find_java() {
  # SiVa 3.10 needs JDK 17 (not macOS /usr/bin stub, not OpenJDK 26 for build)
  local candidate
  for candidate in \
    "/opt/homebrew/opt/openjdk@17/bin/java" \
    "/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home/bin/java" \
    "/opt/homebrew/opt/openjdk@21/bin/java" \
    "/opt/homebrew/opt/openjdk/bin/java"; do
    if [[ -x "$candidate" ]] && "$candidate" -version >/dev/null 2>&1; then
      echo "$candidate"
      return
    fi
  done
  if command -v java >/dev/null 2>&1 && java -version >/dev/null 2>&1; then
    command -v java
    return
  fi
  return 1
}

use_java_home() {
  local java_bin
  java_bin="$(find_java)" || return 1
  export JAVA_HOME="$(cd "$(dirname "$java_bin")/.." && pwd)"
  # Homebrew openjdk@17 layout: bin/java -> ../libexec/openjdk.jdk/Contents/Home/bin/java
  if [[ -d "$(dirname "$java_bin")/../libexec/openjdk.jdk/Contents/Home" ]]; then
    export JAVA_HOME="$(cd "$(dirname "$java_bin")/../libexec/openjdk.jdk/Contents/Home" && pwd)"
  fi
  export PATH="$JAVA_HOME/bin:$PATH"
  info "JAVA_HOME=$JAVA_HOME"
}

cmd_install_deps() {
  command -v brew >/dev/null 2>&1 || die "Homebrew required — https://brew.sh"
  if [[ ! -x /opt/homebrew/opt/openjdk@17/bin/java ]]; then
    info "Installing openjdk@17 via Homebrew (required for SiVa build)…"
    brew install openjdk@17
  fi
  if ! command -v mvn >/dev/null 2>&1; then
    info "Installing Maven via Homebrew…"
    brew install maven || true
  fi
  use_java_home || die "java still not found after install"
  info "OK: java = $(command -v java)"
  java -version
}

cmd_build() {
  ensure_dirs
  use_java_home || die "java not found — run: $0 install-deps"
  if [[ ! -d "$SRC_DIR/.git" ]]; then
    info "Cloning open-eid/SiVa ($SIVA_REF)…"
    rm -rf "$SRC_DIR"
    git clone --depth 1 --branch "$SIVA_REF" https://github.com/open-eid/SiVa.git "$SRC_DIR"
  else
    info "Using existing clone $SRC_DIR — cleaning previous build"
    (cd "$SRC_DIR" && (./mvnw -q clean || mvn -q clean || true))
  fi
  cd "$SRC_DIR"
  if [[ -x ./mvnw ]]; then
    MVN=(./mvnw)
  elif command -v mvn >/dev/null 2>&1; then
    MVN=(mvn)
  else
    die "Maven not found — run: $0 install-deps"
  fi
  info "Building siva-webapp with JDK $(java -version 2>&1 | head -1) (skip tests)…"
  "${MVN[@]}" -pl siva-parent/siva-webapp -am package -DskipTests
  shopt -s nullglob
  jars=(siva-parent/siva-webapp/target/siva-webapp-*-exec.jar)
  shopt -u nullglob
  if [[ ${#jars[@]} -eq 0 ]]; then
    # some versions name without -exec
    shopt -s nullglob
    jars=(siva-parent/siva-webapp/target/siva-webapp-*.jar)
    shopt -u nullglob
  fi
  [[ ${#jars[@]} -gt 0 ]] || die "no siva-webapp jar in target/"
  jar_src="${jars[0]}"
  jar_dst="$JAR_DIR/$(basename "$jar_src")"
  cp -f "$jar_src" "$jar_dst"
  ln -sfn "$(basename "$jar_dst")" "$JAR_DIR/siva-webapp-current.jar"
  info "Installed $jar_dst"
  info "Symlink $JAR_DIR/siva-webapp-current.jar"
}

current_jar() {
  if [[ -L "$JAR_DIR/siva-webapp-current.jar" || -f "$JAR_DIR/siva-webapp-current.jar" ]]; then
    echo "$JAR_DIR/siva-webapp-current.jar"
    return
  fi
  shopt -s nullglob
  jars=("$JAR_DIR"/siva-webapp-*.jar)
  shopt -u nullglob
  [[ ${#jars[@]} -gt 0 ]] || return 1
  echo "${jars[0]}"
}

cmd_start() {
  ensure_dirs
  use_java_home || die "java not found — run: $0 install-deps"
  jar="$(current_jar)" || die "no jar — run: $0 build"
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    info "SiVa already running pid=$(cat "$PID_FILE")"
    cmd_env
    return
  fi
  info "Starting SiVa on 127.0.0.1:${SIVA_PORT} from $jar (TSL load can take 1–3 min)…"
  : >"$LOG_FILE"
  # Double-fork + setsid so agent/IDE shell exit does not SIGTERM the JVM.
  # TSL fetch needs RAM; default heap can die mid-bootstrap.
  python3 - "$PID_FILE" "$LOG_FILE" "$jar" "$SIVA_PORT" "$JAVA_HOME" <<'PY'
import os, sys, time
pid_file, log_file, jar, port, java_home = sys.argv[1:6]
java = os.path.join(java_home, "bin", "java")
# first fork
if os.fork() > 0:
    sys.exit(0)
os.setsid()
# second fork
if os.fork() > 0:
    sys.exit(0)
os.chdir("/")
os.umask(0)
with open(log_file, "ab", buffering=0) as log:
    os.dup2(log.fileno(), 1)
    os.dup2(log.fileno(), 2)
devnull = open(os.devnull, "rb")
os.dup2(devnull.fileno(), 0)
env = os.environ.copy()
env["JAVA_HOME"] = java_home
os.execve(
    java,
    [java, "-Xms256m", "-Xmx1536m", "-jar", jar, f"--server.port={port}"],
    env,
)
PY
  # Parent of double-fork exits immediately; find the real JVM.
  for _ in $(seq 1 30); do
    jpid="$(pgrep -f "siva-webapp.*--server.port=${SIVA_PORT}" | head -1 || true)"
    if [[ -n "${jpid:-}" ]]; then
      echo "$jpid" >"$PID_FILE"
      break
    fi
    sleep 0.2
  done
  [[ -f "$PID_FILE" && -n "$(cat "$PID_FILE")" ]] || die "failed to locate SiVa JVM after detach"
  ready=0
  for i in $(seq 1 180); do
    if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      info "SiVa process exited early — see $LOG_FILE"
      tail -40 "$LOG_FILE" || true
      die "SiVa failed to stay up"
    fi
    if rg -q "Started SivaWebApplication" "$LOG_FILE" 2>/dev/null \
      || grep -q "Started SivaWebApplication" "$LOG_FILE" 2>/dev/null; then
      ready=1
      break
    fi
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${SIVA_PORT}/" || true)"
    if [[ -n "$code" && "$code" != "000" ]]; then
      ready=1
      break
    fi
    if (( i % 15 == 0 )); then
      info "still starting… ${i}s (TSL download)"
    fi
    sleep 1
  done
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${SIVA_PORT}/" || true)"
  info "SiVa pid=$(cat "$PID_FILE") ready_gate=$ready http_root=$code log=$LOG_FILE"
  if [[ "$ready" != "1" ]]; then
    tail -40 "$LOG_FILE" || true
    die "SiVa did not become ready within 180s — check network/TSL egress"
  fi
  cmd_env
}

cmd_stop() {
  stopped=0
  if [[ -f "$PID_FILE" ]]; then
    pid="$(cat "$PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" || true
      info "stopped pid=$pid"
      stopped=1
    fi
    rm -f "$PID_FILE"
  fi
  # Fallback: kill any leftover webapp on our port
  for jpid in $(pgrep -f "siva-webapp.*--server.port=${SIVA_PORT}" 2>/dev/null || true); do
    kill "$jpid" 2>/dev/null || true
    info "stopped leftover pid=$jpid"
    stopped=1
  done
  if [[ "$stopped" != "1" ]]; then
    info "no SiVa process"
  fi
}

cmd_status() {
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    info "running pid=$(cat "$PID_FILE")"
  else
    info "not running"
  fi
  jar="$(current_jar 2>/dev/null || true)"
  info "jar=${jar:-missing}"
  info "log=${LOG_FILE}"
}

cmd_env() {
  # printable for: eval "$(bash scripts/setup-siva-mal-mac.sh env)"
  cat <<EOF
export ORGOS_SIVA_MODE=live
export ORGOS_SIVA_BASE_URL=http://127.0.0.1:${SIVA_PORT}
export ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK=1
# optional sidecar (separate):
# export ORGOS_DIGIDOC_SIDECAR_URL=http://127.0.0.1:9090
# export ORGOS_DIGIDOC_SIDECAR_TOKEN="\$(cat services/secrets/digidoc-sidecar.token)"
EOF
}

usage() {
  cat <<EOF
Usage: $0 <install-deps|build|start|stop|status|env>

  install-deps  Homebrew: Temurin JDK (+ Maven if needed)
  build         Clone open-eid/SiVa @$SIVA_REF and package siva-webapp
  start         Run JAR on 127.0.0.1:$SIVA_PORT (background)
  stop          Stop background JAR
  status        Show pid / jar
  env           Print export lines for OrgOS (eval-able)

See docs/org-os/pdf-esign-siva-mal-mac.md
EOF
}

cmd="${1:-}"
case "$cmd" in
  install-deps) cmd_install_deps ;;
  build) cmd_build ;;
  start) cmd_start ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  env) cmd_env ;;
  *) usage; exit 1 ;;
esac
