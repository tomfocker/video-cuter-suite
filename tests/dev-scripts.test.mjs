import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function writeExecutable(filePath, source) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, source, { mode: 0o755 });
}

function writeFile(filePath, source = '') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, source);
}

function createWorkspace({ withFrontend = true, withBackend = true } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'video-cuter-suite-'));
    const codeRoot = path.join(root, 'Code');
    const suiteRoot = path.join(codeRoot, 'video-cuter-suite');
    const frontendRoot = path.join(codeRoot, 'video-cuter');
    const backendRoot = path.join(codeRoot, 'funasr-server');

    writeFile(path.join(suiteRoot, 'docker-compose.yml'), 'services: {}\n');
    writeFile(path.join(suiteRoot, 'docker-compose.dev.yml'), 'services: {}\n');

    if (withFrontend) {
        writeFile(path.join(frontendRoot, 'full', 'Dockerfile'), 'FROM scratch\n');
    }

    if (withBackend) {
        writeFile(path.join(backendRoot, 'Dockerfile'), 'FROM scratch\n');
    }

    return { root, suiteRoot, frontendRoot, backendRoot };
}

function createMockBin(tempRoot) {
    const binDir = path.join(tempRoot, 'bin');
    const dockerLog = path.join(tempRoot, 'docker.log');
    const curlLog = path.join(tempRoot, 'curl.log');

    writeExecutable(
        path.join(binDir, 'docker'),
        `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${dockerLog}"
if [[ "$*" == *" ps" ]]; then
  printf 'NAME STATUS\\nvideo-cuter-suite-gateway running\\n'
fi
`
    );

    writeExecutable(
        path.join(binDir, 'curl'),
        `#!/usr/bin/env bash
set -euo pipefail
url="\${!#}"
printf '%s\\n' "$url" >> "${curlLog}"
if [[ "$url" == "http://127.0.0.1:18080/healthz" ]]; then
  printf '{"ready":true}\\n'
elif [[ "$url" == "http://127.0.0.1:18000/healthz" ]]; then
  printf '{"ready":true}\\n'
else
  printf '<html>ok</html>\\n'
fi
`
    );

    return { binDir, dockerLog, curlLog };
}

function runScript(scriptName, { env = {}, cwd = '/Users/andy/Code/video-cuter-suite' } = {}) {
    return spawnSync(path.resolve(cwd, 'scripts', scriptName), {
        env: {
            ...process.env,
            ...env
        },
        encoding: 'utf8'
    });
}

test('dev-up fails with a clear message when sibling repos are missing', () => {
    const workspace = createWorkspace({ withFrontend: false, withBackend: false });
    const result = runScript('dev-up', {
        env: {
            CUT_SUITE_ROOT_OVERRIDE: workspace.suiteRoot,
            CUT_SUITE_DRY_RUN: '1'
        }
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing required local repo paths/);
    assert.match(result.stderr, /video-cuter\/full/);
    assert.match(result.stderr, /funasr-server/);
});

test('dev-up prints the unified docker compose command for local source builds', () => {
    const workspace = createWorkspace();
    const result = runScript('dev-up', {
        env: {
            CUT_SUITE_ROOT_OVERRIDE: workspace.suiteRoot,
            CUT_SUITE_DRY_RUN: '1'
        }
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Local source workspaces detected/);
    assert.match(result.stdout, /docker compose/);
    assert.match(result.stdout, /docker-compose\.yml/);
    assert.match(result.stdout, /docker-compose\.dev\.yml/);
    assert.match(result.stdout, /up --build -d/);
});

test('dev-check runs compose ps and both health probes from the suite entrypoint', () => {
    const workspace = createWorkspace();
    const mocks = createMockBin(workspace.root);
    const result = runScript('dev-check', {
        env: {
            CUT_SUITE_ROOT_OVERRIDE: workspace.suiteRoot,
            PATH: `${mocks.binDir}:${process.env.PATH}`
        }
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Gateway health: OK/);
    assert.match(result.stdout, /ASR direct health: OK/);

    const dockerLog = fs.readFileSync(mocks.dockerLog, 'utf8');
    const curlLog = fs.readFileSync(mocks.curlLog, 'utf8');

    assert.match(dockerLog, /compose .* ps/);
    assert.match(curlLog, /http:\/\/127\.0\.0\.1:18080\/healthz/);
    assert.match(curlLog, /http:\/\/127\.0\.0\.1:18000\/healthz/);
});

test('dev-up explains how to recover when docker daemon is unavailable', () => {
    const workspace = createWorkspace();
    const binDir = path.join(workspace.root, 'bin-daemon-down');

    writeExecutable(
        path.join(binDir, 'docker'),
        `#!/usr/bin/env bash
set -euo pipefail
printf 'Cannot connect to the Docker daemon at unix:///tmp/docker.sock\\n' >&2
exit 1
`
    );

    const result = runScript('dev-up', {
        env: {
            CUT_SUITE_ROOT_OVERRIDE: workspace.suiteRoot,
            PATH: `${binDir}:${process.env.PATH}`
        }
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Docker daemon is unavailable/);
    assert.match(result.stderr, /start Docker or OrbStack/);
});

test('dev-check retries a warming gateway before reporting success', () => {
    const workspace = createWorkspace();
    const binDir = path.join(workspace.root, 'bin-retry');
    const dockerLog = path.join(workspace.root, 'docker-retry.log');
    const curlLog = path.join(workspace.root, 'curl-retry.log');
    const gatewayCounter = path.join(workspace.root, 'gateway-counter');

    writeExecutable(
        path.join(binDir, 'docker'),
        `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${dockerLog}"
if [[ "$*" == *" ps" ]]; then
  printf 'NAME STATUS\\nvideo-cuter-suite-gateway healthy\\n'
fi
`
    );

    writeExecutable(
        path.join(binDir, 'curl'),
        `#!/usr/bin/env bash
set -euo pipefail
url="\${!#}"
printf '%s\\n' "$url" >> "${curlLog}"
if [[ "$url" == "http://127.0.0.1:18080/healthz" ]]; then
  count=0
  if [[ -f "${gatewayCounter}" ]]; then
    count="$(cat "${gatewayCounter}")"
  fi
  count=$((count + 1))
  printf '%s' "$count" > "${gatewayCounter}"
  if [[ "$count" -lt 2 ]]; then
    printf 'curl: (22) The requested URL returned error: 502\\n' >&2
    exit 22
  fi
  printf '{"ready":true}\\n'
elif [[ "$url" == "http://127.0.0.1:18000/healthz" ]]; then
  printf '{"ready":true}\\n'
else
  printf '<html>ok</html>\\n'
fi
`
    );

    const result = runScript('dev-check', {
        env: {
            CUT_SUITE_ROOT_OVERRIDE: workspace.suiteRoot,
            PATH: `${binDir}:${process.env.PATH}`
        }
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Gateway health: retrying/);
    assert.match(result.stdout, /Gateway health: OK/);
});
