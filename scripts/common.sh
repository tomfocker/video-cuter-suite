#!/usr/bin/env bash

set -euo pipefail

_cut_script_dir="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CUT_SUITE_ROOT="${CUT_SUITE_ROOT_OVERRIDE:-$(CDPATH='' cd -- "${_cut_script_dir}/.." && pwd)}"
CUT_WORKSPACE_ROOT="$(CDPATH='' cd -- "${CUT_SUITE_ROOT}/.." && pwd)"

CUT_VIDEO_CUTER_ROOT="${CUT_VIDEO_CUTER_ROOT_OVERRIDE:-${CUT_WORKSPACE_ROOT}/video-cuter}"
CUT_FUNASR_SERVER_ROOT="${CUT_FUNASR_SERVER_ROOT_OVERRIDE:-${CUT_WORKSPACE_ROOT}/funasr-server}"

CUT_DOCKER_BIN="${CUT_SUITE_DOCKER_BIN:-docker}"
CUT_CURL_BIN="${CUT_SUITE_CURL_BIN:-curl}"

compose_args=(
  "${CUT_DOCKER_BIN}" compose
  -f "${CUT_SUITE_ROOT}/docker-compose.yml"
  -f "${CUT_SUITE_ROOT}/docker-compose.dev.yml"
)

print_info() {
  printf '%s\n' "$*"
}

print_error() {
  printf '%s\n' "$*" >&2
}

run_cmd() {
  if [[ "${CUT_SUITE_DRY_RUN:-0}" == "1" ]]; then
    printf '+'
    for arg in "$@"; do
      printf ' %q' "${arg}"
    done
    printf '\n'
    return 0
  fi

  "$@"
}

require_local_repos() {
  local missing=()

  [[ -f "${CUT_SUITE_ROOT}/docker-compose.yml" ]] || missing+=("${CUT_SUITE_ROOT}/docker-compose.yml")
  [[ -f "${CUT_SUITE_ROOT}/docker-compose.dev.yml" ]] || missing+=("${CUT_SUITE_ROOT}/docker-compose.dev.yml")
  [[ -f "${CUT_VIDEO_CUTER_ROOT}/full/Dockerfile" ]] || missing+=("${CUT_VIDEO_CUTER_ROOT}/full/Dockerfile (video-cuter/full)")
  [[ -f "${CUT_FUNASR_SERVER_ROOT}/Dockerfile" ]] || missing+=("${CUT_FUNASR_SERVER_ROOT}/Dockerfile (funasr-server)")

  if (( ${#missing[@]} > 0 )); then
    print_error "Missing required local repo paths:"
    printf '%s\n' "${missing[@]}" >&2
    return 1
  fi
}

print_workspace_summary() {
  print_info "Local source workspaces detected:"
  print_info "  suite: ${CUT_SUITE_ROOT}"
  print_info "  frontend: ${CUT_VIDEO_CUTER_ROOT}"
  print_info "  backend: ${CUT_FUNASR_SERVER_ROOT}"
}

run_compose() {
  if [[ "${CUT_SUITE_DRY_RUN:-0}" == "1" ]]; then
    run_cmd "${compose_args[@]}" "$@"
    return 0
  fi

  local output
  if ! output="$("${compose_args[@]}" "$@" 2>&1)"; then
    if [[ "${output}" == *"Cannot connect to the Docker daemon"* ]]; then
      print_error "Docker daemon is unavailable. Please start Docker or OrbStack, then retry."
    fi
    print_error "${output}"
    return 1
  fi

  if [[ -n "${output}" ]]; then
    print_info "${output}"
  fi
}

probe_url() {
  local label="$1"
  local url="$2"
  local attempts="${3:-1}"
  local sleep_seconds="${4:-2}"
  local attempt=1
  local output

  while (( attempt <= attempts )); do
    if output="$("${CUT_CURL_BIN}" -fsS "${url}" 2>&1)"; then
      print_info "${label}: OK (${url})"
      if [[ -n "${output}" ]]; then
        print_info "${output}"
      fi
      return 0
    fi

    if (( attempt < attempts )); then
      print_info "${label}: retrying (${attempt}/${attempts}) after probe failure at ${url}"
      sleep "${sleep_seconds}"
    else
      print_error "${label}: FAIL (${url})"
      print_error "${output}"
      return 1
    fi

    attempt=$((attempt + 1))
  done
}
