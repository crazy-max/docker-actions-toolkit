/**
 * Copyright 2023 actions-toolkit authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {describe, expect, it, vi, test, beforeEach, afterEach} from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as rimraf from 'rimraf';
import * as semver from 'semver';

import {Buildx} from '../../src/buildx/buildx.js';
import {Context} from '../../src/context.js';
import {Exec} from '../../src/exec.js';

import {Cert, LocalState} from '../../src/types/buildx/buildx.js';

const fixturesDir = path.join(__dirname, '..', '.fixtures');
const tmpDir = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'buildx-buildx-'));
const tmpName = path.join(tmpDir, '.tmpname-vi');

vi.spyOn(Context, 'tmpDir').mockImplementation((): string => {
  fs.mkdirSync(tmpDir, {recursive: true});
  return tmpDir;
});

vi.spyOn(Context, 'tmpName').mockImplementation((): string => {
  return tmpName;
});

afterEach(() => {
  rimraf.sync(tmpDir);
});

describe('configDir', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      BUILDX_CONFIG: '/var/docker/buildx',
      DOCKER_CONFIG: '/var/docker/config'
    };
  });
  afterEach(() => {
    process.env = originalEnv;
  });
  it('returns default', async () => {
    process.env.BUILDX_CONFIG = '';
    expect(Buildx.configDir).toEqual(path.join('/var/docker/config', 'buildx'));
  });
  it('returns from env', async () => {
    expect(Buildx.configDir).toEqual('/var/docker/buildx');
  });
});

describe('certsDir', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      BUILDX_CONFIG: '/var/docker/buildx'
    };
  });
  afterEach(() => {
    process.env = originalEnv;
  });
  it('returns default', async () => {
    process.env.BUILDX_CONFIG = '/var/docker/buildx';
    expect(Buildx.certsDir).toEqual(path.join('/var/docker/buildx', 'certs'));
  });
});

describe('isAvailable', () => {
  it('docker cli', async () => {
    const execSpy = vi.spyOn(Exec, 'getExecOutput');
    const buildx = new Buildx({
      standalone: false
    });
    await buildx.isAvailable();
    expect(execSpy).toHaveBeenCalledWith(`docker`, ['buildx'], {
      silent: true,
      ignoreReturnCode: true
    });
  });
  it('standalone', async () => {
    const execSpy = vi.spyOn(Exec, 'getExecOutput');
    const buildx = new Buildx({
      standalone: true
    });
    await buildx.isAvailable();
    expect(execSpy).toHaveBeenCalledWith(`buildx`, [], {
      silent: true,
      ignoreReturnCode: true
    });
  });
});

describe('printVersion', () => {
  it('docker cli', async () => {
    const execSpy = vi.spyOn(Exec, 'exec');
    const buildx = new Buildx({
      standalone: false
    });
    await buildx.printVersion();
    expect(execSpy).toHaveBeenCalledWith(`docker`, ['buildx', 'version'], {
      failOnStdErr: false
    });
  });
  it('standalone', async () => {
    const execSpy = vi.spyOn(Exec, 'exec');
    const buildx = new Buildx({
      standalone: true
    });
    await buildx.printVersion();
    expect(execSpy).toHaveBeenCalledWith(`buildx`, ['version'], {
      failOnStdErr: false
    });
  });
});

describe('version', () => {
  it('valid', async () => {
    const buildx = new Buildx();
    expect(semver.valid(await buildx.version())).not.toBeUndefined();
  });
});

describe('parseVersion', () => {
  test.each([
    ['github.com/docker/buildx 0.4.1+azure bda4882a65349ca359216b135896bddc1d92461c', '0.4.1'],
    ['github.com/docker/buildx v0.4.1 bda4882a65349ca359216b135896bddc1d92461c', '0.4.1'],
    ['github.com/docker/buildx v0.4.2 fb7b670b764764dc4716df3eba07ffdae4cc47b2', '0.4.2'],
    ['github.com/docker/buildx f117971 f11797113e5a9b86bd976329c5dbb8a8bfdfadfa', 'f117971']
  ])('given %o', async (stdout, expected) => {
    expect(Buildx.parseVersion(stdout)).toEqual(expected);
  });
});

describe('getErrorMessage', () => {
  test.each([
    {
      name: 'attestation error followed by driver guidance',
      stderr: [
        'ERROR: failed to build: Attestation is not supported for the docker driver.',
        'Switch to a different driver, or turn on the containerd image store, and try again.',
        'Learn more at https://docs.docker.com/go/attestations/'
      ].join('\n'),
      expected: 'failed to build: Attestation is not supported for the docker driver.'
    },
    {
      name: 'cache export error followed by driver guidance',
      stderr: [
        'ERROR: failed to build: Cache export is not supported for the docker driver.',
        'Switch to a different driver, or turn on the containerd image store, and try again.',
        'Learn more at https://docs.docker.com/go/build-cache-backends/'
      ].join('\n'),
      expected: 'failed to build: Cache export is not supported for the docker driver.'
    },
    {
      // https://github.com/docker/build-push-action/issues/1433
      name: 'build summary after a vertex error',
      stderr: [
        '#11 ERROR: process "/bin/sh -c sha256sum --check license.sha256sum" did not complete successfully: exit code: 1',
        'ERROR: failed to build: failed to solve: process "/bin/sh -c sha256sum --check license.sha256sum" did not complete successfully: exit code: 1'
      ].join('\n'),
      expected: 'failed to build: failed to solve: process "/bin/sh -c sha256sum --check license.sha256sum" did not complete successfully: exit code: 1'
    },
    {
      // https://github.com/docker/bake-action/issues/306
      name: 'bake cache exporter error',
      stderr: 'ERROR: failed to solve: unknown cache exporter: "gha,mode=max"\n',
      expected: 'failed to solve: unknown cache exporter: "gha,mode=max"'
    },
    {
      // https://github.com/docker/bake-action/issues/262
      name: 'bake git error followed by subprocess stderr',
      stderr: ['ERROR: failed to solve: failed to checkout remote https://github.com/vivodi/docker-flexget.git: git stderr:', 'fatal: unable to read tree (569a8e0674b0f11330577cddb340fbc67871e4f2)', ': exit status 128'].join('\n'),
      expected: 'failed to solve: failed to checkout remote https://github.com/vivodi/docker-flexget.git: git stderr:'
    },
    {
      // https://github.com/docker/setup-buildx-action/issues/255
      name: 'builder creation error',
      stderr:
        'ERROR: could not create a builder instance with TLS data loaded from environment. Please use `docker context create <context-name>` to create a context for current environment and then create a builder instance with `docker buildx create <context-name>`\n',
      expected:
        'could not create a builder instance with TLS data loaded from environment. Please use `docker context create <context-name>` to create a context for current environment and then create a builder instance with `docker buildx create <context-name>`'
    },
    {
      // https://github.com/docker/build-push-action/issues/264
      name: 'older Buildx error without a prefix',
      stderr: ['#1 DONE 0.0s', 'failed to solve: rpc error: code = Unknown desc = failed to solve with frontend dockerfile.v0: failed to read dockerfile: open /tmp/buildkit-mount967127233/build.Dockerfile: no such file or directory'].join(
        '\n'
      ),
      expected: 'failed to solve: rpc error: code = Unknown desc = failed to solve with frontend dockerfile.v0: failed to read dockerfile: open /tmp/buildkit-mount967127233/build.Dockerfile: no such file or directory'
    },
    {
      // https://github.com/docker/buildx/issues/2382
      name: 'Desktop build details after the error',
      stderr: 'ERROR: failed to solve: process "/bin/sh -c exit 1" did not complete successfully: exit code: 1\n\nView build details: docker-desktop://dashboard/build/default/default/vetboddpu4fpa38o97opuyj0a\n',
      expected: 'failed to solve: process "/bin/sh -c exit 1" did not complete successfully: exit code: 1'
    },
    {
      // https://github.com/docker/buildx/issues/3173
      name: 'bake HCL diagnostic after a source excerpt',
      stderr: [
        'docker-bake.hcl:13',
        '--------------------',
        '  12 |         contexts = { primary = "target:tgt1" }',
        '  13 | >>>     tags = [ target.tgt1.tags.0, "secondary-image:latest" ]',
        '  14 |     }',
        '--------------------',
        'ERROR: docker-bake.hcl:13,30-32: Attempt to index null value; This value is null, so it does not have any indices., and 1 other diagnostic(s)'
      ].join('\n'),
      expected: 'docker-bake.hcl:13,30-32: Attempt to index null value; This value is null, so it does not have any indices., and 1 other diagnostic(s)'
    },
    {
      // https://github.com/docker/buildx/issues/3238
      name: 'Windows file error after an incidental HTTP/2 diagnostic',
      stderr: [
        '2025/06/11 15:53:20 http2: server: error reading preface from client //./pipe/dockerDesktopLinuxEngine: file has already been closed',
        'ERROR: resolve : CreateFile C:\\Users\\Gili\\Documents\\docker\\buildx\\src\\test\\resources\\missing: The system cannot find the file specified.'
      ].join('\r\n'),
      expected: 'resolve : CreateFile C:\\Users\\Gili\\Documents\\docker\\buildx\\src\\test\\resources\\missing: The system cannot find the file specified.'
    },
    {
      // https://github.com/docker/buildx/issues/3374
      name: 'terminal registry failure after secondary missing blob errors',
      stderr: [
        '#16 ERROR: blob sha256:117fe295ae589c229bf12bc2aef5912da375efb8228d2aae8e59b634cc91526c not found',
        '#15 ERROR: blob sha256:117fe295ae589c229bf12bc2aef5912da375efb8228d2aae8e59b634cc91526c not found',
        'ERROR: failed to build: failed to solve: failed to compute cache key: failed to copy: httpReadSeeker: failed open: unexpected status code https://ghcr.io/v2/osgeo/gdal/blobs/sha256:50fc4bfbbaf374c273c554992eb7e14b5e66dc6dfa59a72f46023825e5d6fcc9: 502 Bad Gateway'
      ].join('\n'),
      expected:
        'failed to build: failed to solve: failed to compute cache key: failed to copy: httpReadSeeker: failed open: unexpected status code https://ghcr.io/v2/osgeo/gdal/blobs/sha256:50fc4bfbbaf374c273c554992eb7e14b5e66dc6dfa59a72f46023825e5d6fcc9: 502 Bad Gateway'
    },
    {
      // https://github.com/docker/buildx/issues/4067
      // The summary is generic here; the preceding node error stays in the logs.
      name: 'builder removal summary after a detailed node error',
      stderr: [
        'failed to remove rmtimeout-531610: failed to remove node rmtimeout-5316100: Delete "http://%2Ftmp%2Ftmp.hU31tUGWsv%2Fdocker.sock/v1.55/volumes/buildx_buildkit_rmtimeout-5316100_state": context deadline exceeded',
        'ERROR: failed to remove one or more builders'
      ].join('\n'),
      expected: 'failed to remove one or more builders'
    },
    {
      name: 'debug stack trace after the error',
      stderr: 'ERROR: failed to solve: context canceled\ngithub.com/docker/buildx/commands.runBuild\n\t/src/commands/build.go:100\nruntime.goexit\n\t/usr/local/go/src/runtime/asm_amd64.s:1700\n',
      expected: 'failed to solve: context canceled'
    },
    {
      name: 'CLI usage after the error',
      stderr: "ERROR: docker: 'docker buildx build' requires 1 argument\n\nUsage:  docker buildx build [OPTIONS] PATH | URL | -\n\nRun 'docker buildx build --help' for more information\n",
      expected: "docker: 'docker buildx build' requires 1 argument"
    },
    {
      name: 'last summary wins',
      stderr: 'ERROR: earlier error\n#2 ERROR: vertex error\nERROR: final error\nLearn more at https://docs.docker.com/\n',
      expected: 'final error'
    },
    {
      name: 'embedded error markers do not override the summary',
      stderr: 'ERROR: build failed\n#2 ERROR: vertex error\nwarning: ERROR: embedded text\n',
      expected: 'build failed'
    },
    {
      name: 'ANSI colors and Windows line endings',
      stderr: '\u001b[31mERROR:\u001b[0m failed to build: invalid tag\r\nLearn more at https://docs.docker.com/\r\n\r\n',
      expected: 'failed to build: invalid tag'
    },
    {
      name: 'carriage return separated output',
      stderr: '#1 building\rERROR: build failed\rtrailing hint\r',
      expected: 'build failed'
    },
    {
      name: 'whitespace around the summary',
      stderr: '\t ERROR:   build failed  \n\t hint\n',
      expected: 'build failed'
    },
    {
      name: 'last non-empty line fallback',
      stderr: 'warning: something went wrong\n  build failed  \n\t\n',
      expected: 'build failed'
    },
    {
      name: 'ANSI colors in the fallback',
      stderr: '\u001b[31mbuild failed\u001b[0m\n\u001b[0m',
      expected: 'build failed'
    },
    {name: 'empty output', stderr: '', expected: 'unknown error'},
    {name: 'whitespace-only output', stderr: ' \r\n\t\n', expected: 'unknown error'},
    {name: 'empty summary', stderr: 'ERROR: \nLearn more at https://docs.docker.com/\n', expected: 'unknown error'},
    {
      // https://github.com/docker/build-push-action/issues/1610
      name: 'long source and whitespace lines',
      stderr: `${'x'.repeat(30000)}\n${' '.repeat(30000)}\nERROR: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 1\n`,
      expected: 'failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 1'
    },
    {
      name: 'long whitespace lines without a summary',
      stderr: `${'x'.repeat(30000)}\n${' '.repeat(30000)}\nbuild failed\n${' '.repeat(30000)}\n`,
      expected: 'build failed'
    }
  ])('$name', ({stderr, expected}) => {
    expect(Buildx.getErrorMessage(stderr)).toEqual(expected);
  });
});

describe('versionSatisfies', () => {
  test.each([
    ['0.4.1', '>=0.3.2', true],
    ['bda4882a65349ca359216b135896bddc1d92461c', '>0.1.0', false],
    ['f117971', '>0.6.0', true]
  ])('given %o', async (version, range, expected) => {
    const buildx = new Buildx();
    expect(await buildx.versionSatisfies(range, version)).toBe(expected);
  });
});

describe('resolveCertsDriverOpts', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      BUILDX_CONFIG: path.join(tmpDir, 'resolveCertsDriverOpts', 'buildx')
    };
  });
  afterEach(() => {
    process.env = originalEnv;
    rimraf.sync(path.join(tmpDir, 'resolveCertsDriverOpts', 'buildx'));
  });
  // prettier-ignore
  test.each([
    [
      1,
      'mycontext',
      'docker-container',
      {},
      [],
      []
    ],
    [
      2,
      'docker-container://mycontainer',
      'docker-container',
      {},
      [],
      []
    ],
    [
      3,
      'tcp://graviton2:1234',
      'remote',
      {},
      [],
      []
    ],
    [
      4,
      'tcp://graviton2:1234',
      'remote',
      {
        cacert: 'foo',
        cert: 'foo',
        key: 'foo',
      } as Cert,
      [
        path.join(tmpDir, 'resolveCertsDriverOpts', 'buildx', 'certs', 'cacert_graviton2-1234.pem'),
        path.join(tmpDir, 'resolveCertsDriverOpts', 'buildx', 'certs', 'cert_graviton2-1234.pem'),
        path.join(tmpDir, 'resolveCertsDriverOpts', 'buildx', 'certs', 'key_graviton2-1234.pem')
      ],
      [
        `cacert=${path.join(tmpDir, 'resolveCertsDriverOpts', 'buildx', 'certs', 'cacert_graviton2-1234.pem')}`,
        `cert=${path.join(tmpDir, 'resolveCertsDriverOpts', 'buildx', 'certs', 'cert_graviton2-1234.pem')}`,
        `key=${path.join(tmpDir, 'resolveCertsDriverOpts', 'buildx', 'certs', 'key_graviton2-1234.pem')}`
      ]
    ],
    [
      5,
      'tcp://mybuilder:1234',
      'docker-container',
      {
        cacert: 'foo',
        cert: 'foo',
        key: 'foo',
      } as Cert,
      [
        path.join(tmpDir, 'resolveCertsDriverOpts', 'buildx', 'certs', 'cacert_mybuilder-1234.pem'),
        path.join(tmpDir, 'resolveCertsDriverOpts', 'buildx', 'certs', 'cert_mybuilder-1234.pem'),
        path.join(tmpDir, 'resolveCertsDriverOpts', 'buildx', 'certs', 'key_mybuilder-1234.pem')
      ],
      []
    ],
  ])('%o. given %o endpoint, %o driver', async (id: number, endpoint: string, driver: string, cert: Cert, expectedFiles: Array<string>, expectedOpts: Array<string>) => {
    fs.mkdirSync(Buildx.certsDir, {recursive: true});
    expect(Buildx.resolveCertsDriverOpts(driver, endpoint, cert)).toEqual(expectedOpts);
    for (const k in expectedFiles) {
      const file = expectedFiles[k];
      expect(fs.existsSync(file)).toBe(true);
    }
  });
});

describe('localState', () => {
  // prettier-ignore
  test.each([
    [
      'default/default/ij71n3ubmhck85d03zdvye5nr',
      {
        LocalPath: '/home/crazymax/github/docker_org/buildx',
        DockerfilePath: '/home/crazymax/github/docker_org/buildx/Dockerfile'
      } as LocalState,
    ],
    [
      'default/default/7pnnqpgacnqq98oa1a1h5sz6t',
      {
        LocalPath: 'https://github.com/docker/actions-toolkit.git#:__tests__/fixtures',
        DockerfilePath: 'hello.Dockerfile'
      } as LocalState,
    ],
    [
      'default/default/84p2qpgacnqq98oa1a1h5sz6t',
      {
        LocalPath: 'https://github.com/docker/actions-toolkit.git#:__tests__/fixtures',
        DockerfilePath: '-'
      } as LocalState,
    ],
    [
      'default/default/a5s9rlg9cnqq98oa1a1h5sz6t',
      {
        LocalPath: '-',
        DockerfilePath: ''
      } as LocalState,
    ],
    [
      'default/default/aav2ix4nw5eky66fw045dkylr',
      {
        LocalPath: 'https://github.com/docker/buildx.git',
        DockerfilePath: ''
      } as LocalState,
    ],
    [
      'default/default/dfsz8r57a98zf789pmlyzqp3n',
      {
        LocalPath: 'https://github.com/docker/actions-toolkit.git#:__tests__/fixtures',
        DockerfilePath: 'hello.Dockerfile'
      } as LocalState,
    ],
    [
      'default/default/w38vcd5fo5cfvfyig77qjec0v',
      {
        LocalPath: '/home/crazy/hello',
        DockerfilePath: '-'
      } as LocalState,
    ]
  ])('given %o', async (ref: string, expected: LocalState) => {
    const localState = Buildx.localState(ref, path.join(fixturesDir, 'buildx-refs'));
    expect(localState).toEqual(expected);
  });
});

describe('refs', () => {
  it('returns all refs', async () => {
    const refs = Buildx.refs({
      dir: path.join(fixturesDir, 'buildx-refs')
    });
    expect(Object.keys(refs).length).toEqual(17);
  });
  it('returns default builder refs', async () => {
    const refs = Buildx.refs({
      dir: path.join(fixturesDir, 'buildx-refs'),
      builderName: 'default'
    });
    expect(Object.keys(refs).length).toEqual(14);
  });
  it('returns foo builder refs', async () => {
    const refs = Buildx.refs({
      dir: path.join(fixturesDir, 'buildx-refs'),
      builderName: 'foo'
    });
    expect(Object.keys(refs).length).toEqual(3);
  });
  it('returns default builder refs since', async () => {
    const mdate = new Date('2023-09-05T00:00:00Z');
    fs.utimesSync(path.join(fixturesDir, 'buildx-refs', 'default', 'default', '36dix0eiv9evr61vrwzn32w7q'), mdate, mdate);
    fs.utimesSync(path.join(fixturesDir, 'buildx-refs', 'default', 'default', '49p5r8und2konke5pmlyzqp3n'), mdate, mdate);
    fs.utimesSync(path.join(fixturesDir, 'buildx-refs', 'default', 'default', 'a8zqzhhv5yiazm396jobsgdw2'), mdate, mdate);
    const refs = Buildx.refs({
      dir: path.join(fixturesDir, 'buildx-refs'),
      builderName: 'default',
      since: new Date('2024-01-10T00:00:00Z')
    });
    expect(Object.keys(refs).length).toEqual(11);
  });
});
