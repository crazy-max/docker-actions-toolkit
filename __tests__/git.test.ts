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

import {execFileSync} from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Git} from '../src/git.js';
import {Exec} from '../src/exec.js';
import {ExecOutput} from '@actions/exec';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('context', () => {
  it('returns mocked ref and sha', async () => {
    vi.spyOn(Exec, 'getExecOutput').mockImplementation((cmd, args): Promise<ExecOutput> => {
      const fullCmd = `${cmd} ${args?.join(' ')}`;
      let result = '';
      switch (fullCmd) {
        case 'git show --format=%H HEAD --quiet --':
          result = 'test-sha';
          break;
        case 'git branch --show-current':
          result = 'test';
          break;
        case 'git symbolic-ref HEAD':
          result = 'refs/heads/test';
          break;
      }
      return Promise.resolve({
        stdout: result,
        stderr: '',
        exitCode: 0
      });
    });
    const ctx = await Git.context();
    expect(ctx.ref).toEqual('refs/heads/test');
    expect(ctx.sha).toEqual('test-sha');
  });

  it('returns the SHA without a named ref for a shallow SHA checkout', async () => {
    const tmpDir = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'git-context-'));
    const sourceDir = path.join(tmpDir, 'source');
    const checkoutDir = path.join(tmpDir, 'checkout');
    const git = (cwd: string, args: string[]) => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: 'pipe'}).trim();

    git(tmpDir, ['init', sourceDir]);
    for (const message of ['initial', 'second']) {
      git(sourceDir, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', message]);
    }
    const sha = git(sourceDir, ['rev-parse', 'HEAD']);
    git(tmpDir, ['init', checkoutDir]);
    git(checkoutDir, ['fetch', '--depth=1', '--no-tags', sourceDir, sha]);
    git(checkoutDir, ['checkout', '--detach', 'FETCH_HEAD']);

    expect(git(checkoutDir, ['rev-parse', '--is-shallow-repository'])).toEqual('true');
    expect(git(checkoutDir, ['for-each-ref', '--format=%(refname)'])).toEqual('');

    const getExecOutput = Exec.getExecOutput;
    vi.spyOn(Exec, 'getExecOutput').mockImplementation((cmd, args, options) => getExecOutput(cmd, args, {...options, cwd: checkoutDir}));

    const ctx = await Git.context();
    expect(ctx.ref).toEqual('');
    expect(ctx.sha).toEqual(sha);
  });

  it('propagates Git command failures during ref inference', async () => {
    vi.spyOn(Exec, 'getExecOutput')
      .mockResolvedValueOnce({stdout: '', stderr: '', exitCode: 0})
      .mockResolvedValueOnce({stdout: 'grafted, HEAD', stderr: '', exitCode: 0})
      .mockResolvedValueOnce({stdout: '', stderr: 'fatal: failed to read refs', exitCode: 128});

    await expect(Git.context()).rejects.toThrow('fatal: failed to read refs');
  });
});

describe('working directory', () => {
  let tmpDir: string;

  beforeEach(() => {
    // Keep the fixture on the same drive as cwd so relative paths work on Windows.
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'git-directory-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, {recursive: true, force: true});
  });

  it.each(['absolute', 'relative'])(
    'reads the selected checkout (%s path)',
    async pathType => {
      const checkoutDir = path.join(tmpDir, 'nested checkout');
      const cwd = pathType === 'relative' ? path.relative(process.cwd(), checkoutDir) : checkoutDir;
      const commitDate = '2024-01-02T03:04:05Z';
      const git = (args: string[]) =>
        execFileSync('git', ['-C', checkoutDir, ...args], {
          encoding: 'utf8',
          stdio: 'pipe',
          env: {...process.env, GIT_AUTHOR_DATE: commitDate, GIT_COMMITTER_DATE: commitDate}
        }).trim();
      const commit = (message: string) => git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', message]);

      fs.mkdirSync(checkoutDir);
      git(['init', '--initial-branch=test']);
      commit('initial');
      git(['tag', 'v1.0.0']);
      git(['remote', 'add', 'origin', 'https://example.com/selected-repo.git']);
      const sha = git(['rev-parse', 'HEAD']);

      expect(await Git.isInsideWorkTree(cwd)).toEqual(true);
      expect(await Git.remoteURL(cwd)).toEqual('https://example.com/selected-repo.git');
      expect(await Git.context(cwd)).toMatchObject({ref: 'refs/heads/test', sha});
      expect(await Git.fullCommit(cwd)).toEqual(sha);
      expect(await Git.shortCommit(cwd)).toEqual(git(['rev-parse', '--short', 'HEAD']));
      expect(await Git.commitDate(sha, cwd)).toEqual(new Date(commitDate));
      expect(await Git.tag(cwd)).toEqual('v1.0.0');

      git(['checkout', '--detach', 'HEAD']);
      expect(await Git.context(cwd)).toMatchObject({ref: 'refs/tags/v1.0.0', sha});

      git(['checkout', 'test']);
      commit('second');
      expect(await Git.tag(cwd)).toEqual('v1.0.0');
      const detachedSha = git(['rev-parse', 'HEAD']);
      commit('third');
      git(['tag', 'v2.0.0']);
      git(['checkout', '--detach', detachedSha]);
      expect(await Git.context(cwd)).toMatchObject({ref: 'refs/heads/test', sha: detachedSha});

      git(['update-ref', 'refs/remotes/origin/test', 'refs/heads/test']);
      git(['branch', '-D', 'test']);
      expect(await Git.context(cwd)).toMatchObject({ref: 'refs/heads/test', sha: detachedSha});

      git(['update-ref', '-d', 'refs/remotes/origin/test']);
      expect(await Git.context(cwd)).toMatchObject({ref: 'refs/tags/v2.0.0', sha: detachedSha});
    },
    30000
  );
});

describe('isInsideWorkTree', () => {
  it('have been called', async () => {
    const execSpy = vi.spyOn(Exec, 'getExecOutput');
    try {
      await Git.isInsideWorkTree();
    } catch {
      // noop
    }
    expect(execSpy).toHaveBeenCalledWith(`git`, ['rev-parse', '--is-inside-work-tree'], {
      silent: true,
      ignoreReturnCode: true
    });
  });
});

describe('remoteSha', () => {
  it('returns sha using git ls-remote', async () => {
    expect(await Git.remoteSha('https://github.com/docker/buildx.git', 'refs/pull/648/head')).toEqual('f11797113e5a9b86bd976329c5dbb8a8bfdfadfa');
  });
});

describe('remoteURL', () => {
  it('have been called', async () => {
    const execSpy = vi.spyOn(Exec, 'getExecOutput');
    try {
      await Git.remoteURL();
    } catch {
      // noop
    }
    expect(execSpy).toHaveBeenCalledWith(`git`, ['remote', 'get-url', 'origin'], {
      silent: true,
      ignoreReturnCode: true
    });
  });
});

describe('ref', () => {
  it('returns mocked ref', async () => {
    vi.spyOn(Exec, 'getExecOutput').mockImplementation((cmd, args): Promise<ExecOutput> => {
      const fullCmd = `${cmd} ${args?.join(' ')}`;
      let result = '';
      switch (fullCmd) {
        case 'git branch --show-current':
          result = 'test';
          break;
        case 'git symbolic-ref HEAD':
          result = 'refs/heads/test';
          break;
      }
      return Promise.resolve({
        stdout: result,
        stderr: '',
        exitCode: 0
      });
    });
    const ref = await Git.ref();
    expect(ref).toEqual('refs/heads/test');
  });

  it('returns mocked detached tag ref', async () => {
    vi.spyOn(Exec, 'getExecOutput').mockImplementation((cmd, args): Promise<ExecOutput> => {
      const fullCmd = `${cmd} ${args?.join(' ')}`;
      let result = '';
      switch (fullCmd) {
        case 'git branch --show-current':
          result = '';
          break;
        case 'git show -s --pretty=%D':
          result = 'HEAD, tag: 8.0.0';
          break;
        case 'git for-each-ref --format=%(refname) --points-at HEAD refs/tags/':
          result = 'refs/tags/8.0.0';
          break;
      }
      return Promise.resolve({
        stdout: result,
        stderr: '',
        exitCode: 0
      });
    });
    const ref = await Git.ref();
    expect(ref).toEqual('refs/tags/8.0.0');
  });

  it('returns mocked detached tag ref (shallow clone)', async () => {
    vi.spyOn(Exec, 'getExecOutput').mockImplementation((cmd, args): Promise<ExecOutput> => {
      const fullCmd = `${cmd} ${args?.join(' ')}`;
      let result = '';
      switch (fullCmd) {
        case 'git branch --show-current':
          result = '';
          break;
        case 'git show -s --pretty=%D':
          result = 'grafted, HEAD, tag: 8.0.0';
          break;
        case 'git for-each-ref --format=%(refname) --points-at HEAD refs/tags/':
          result = 'refs/tags/8.0.0';
          break;
      }
      return Promise.resolve({
        stdout: result,
        stderr: '',
        exitCode: 0
      });
    });
    const ref = await Git.ref();
    expect(ref).toEqual('refs/tags/8.0.0');
  });

  it('returns mocked detached pull request merge ref (shallow clone)', async () => {
    vi.spyOn(Exec, 'getExecOutput').mockImplementation((cmd, args): Promise<ExecOutput> => {
      const fullCmd = `${cmd} ${args?.join(' ')}`;
      let result = '';
      switch (fullCmd) {
        case 'git branch --show-current':
          result = '';
          break;
        case 'git show -s --pretty=%D':
          result = 'grafted, HEAD, pull/221/merge';
          break;
      }
      return Promise.resolve({
        stdout: result,
        stderr: '',
        exitCode: 0
      });
    });
    const ref = await Git.ref();
    expect(ref).toEqual('refs/pull/221/merge');
  });

  it('should throws an error when detached HEAD ref is not supported', async () => {
    vi.spyOn(Exec, 'getExecOutput').mockImplementation((cmd, args): Promise<ExecOutput> => {
      const fullCmd = `${cmd} ${args?.join(' ')}`;
      let result = '';
      switch (fullCmd) {
        case 'git branch --show-current':
          result = '';
          break;
        case 'git show -s --pretty=%D':
          result = 'wrong, HEAD, tag: 8.0.0';
          break;
      }
      return Promise.resolve({
        stdout: result,
        stderr: '',
        exitCode: 0
      });
    });
    await expect(Git.ref()).rejects.toThrow('Cannot find detached HEAD ref in "wrong, HEAD, tag: 8.0.0"');
  });

  it('returns mocked detached branch ref', async () => {
    vi.spyOn(Exec, 'getExecOutput').mockImplementation((cmd, args): Promise<ExecOutput> => {
      const fullCmd = `${cmd} ${args?.join(' ')}`;
      let result = '';
      switch (fullCmd) {
        case 'git branch --show-current':
          result = '';
          break;
        case 'git show -s --pretty=%D':
          result = 'HEAD, origin/test, test';
          break;
      }
      return Promise.resolve({
        stdout: result,
        stderr: '',
        exitCode: 0
      });
    });
    const ref = await Git.ref();
    expect(ref).toEqual('refs/heads/test');
  });

  it('returns mocked detached branch ref checked out by SHA', async () => {
    vi.spyOn(Exec, 'getExecOutput').mockImplementation((cmd, args): Promise<ExecOutput> => {
      const fullCmd = `${cmd} ${args?.join(' ')}`;
      let result = '';
      switch (fullCmd) {
        case 'git branch --show-current':
          result = '';
          break;
        case 'git show -s --pretty=%D':
          result = 'HEAD, origin/feature-branch';
          break;
      }
      return Promise.resolve({
        stdout: result,
        stderr: '',
        exitCode: 0
      });
    });
    const ref = await Git.ref();
    expect(ref).toEqual('refs/heads/feature-branch');
  });

  it('infers ref from local branch when detached HEAD returns only "HEAD"', async () => {
    vi.spyOn(Exec, 'getExecOutput').mockImplementation((cmd, args): Promise<ExecOutput> => {
      const fullCmd = `${cmd} ${args?.join(' ')}`;
      let result = '';
      switch (fullCmd) {
        case 'git branch --show-current':
          result = '';
          break;
        case 'git show -s --pretty=%D':
          result = 'HEAD';
          break;
        case 'git for-each-ref --format=%(refname) --contains HEAD --sort=-committerdate refs/heads/':
          result = 'refs/heads/main\nrefs/heads/develop';
          break;
      }
      return Promise.resolve({
        stdout: result,
        stderr: '',
        exitCode: 0
      });
    });
    const ref = await Git.ref();
    expect(ref).toEqual('refs/heads/main');
  });

  it('infers ref from local branch when detached HEAD returns only "grafted, HEAD"', async () => {
    vi.spyOn(Exec, 'getExecOutput').mockImplementation((cmd, args): Promise<ExecOutput> => {
      const fullCmd = `${cmd} ${args?.join(' ')}`;
      let result = '';
      switch (fullCmd) {
        case 'git branch --show-current':
          result = '';
          break;
        case 'git show -s --pretty=%D':
          result = 'grafted, HEAD';
          break;
        case 'git for-each-ref --format=%(refname) --contains HEAD --sort=-committerdate refs/heads/':
          result = 'refs/heads/main\nrefs/heads/develop';
          break;
      }
      return Promise.resolve({
        stdout: result,
        stderr: '',
        exitCode: 0
      });
    });
    const ref = await Git.ref();
    expect(ref).toEqual('refs/heads/main');
  });

  it('infers ref from remote branch when no local branch contains HEAD', async () => {
    vi.spyOn(Exec, 'getExecOutput').mockImplementation((cmd, args): Promise<ExecOutput> => {
      const fullCmd = `${cmd} ${args?.join(' ')}`;
      let result = '';
      switch (fullCmd) {
        case 'git branch --show-current':
          result = '';
          break;
        case 'git show -s --pretty=%D':
          result = 'HEAD';
          break;
        case 'git for-each-ref --format=%(refname) --contains HEAD --sort=-committerdate refs/heads/':
          result = '';
          break;
        case 'git for-each-ref --format=%(refname) --contains HEAD --sort=-committerdate refs/remotes/':
          result = 'refs/remotes/origin/feature';
          break;
      }
      return Promise.resolve({
        stdout: result,
        stderr: '',
        exitCode: 0
      });
    });
    const ref = await Git.ref();
    expect(ref).toEqual('refs/heads/feature');
  });

  it('infers ref from tag when no branch contains HEAD', async () => {
    vi.spyOn(Exec, 'getExecOutput').mockImplementation((cmd, args): Promise<ExecOutput> => {
      const fullCmd = `${cmd} ${args?.join(' ')}`;
      let result = '';
      switch (fullCmd) {
        case 'git branch --show-current':
          result = '';
          break;
        case 'git show -s --pretty=%D':
          result = 'HEAD';
          break;
        case 'git for-each-ref --format=%(refname) --contains HEAD --sort=-committerdate refs/heads/':
          result = '';
          break;
        case 'git for-each-ref --format=%(refname) --contains HEAD --sort=-committerdate refs/remotes/':
          result = '';
          break;
        case 'git tag --contains HEAD':
          result = 'v1.0.0\nv0.9.0';
          break;
      }
      return Promise.resolve({
        stdout: result,
        stderr: '',
        exitCode: 0
      });
    });
    const ref = await Git.ref();
    expect(ref).toEqual('refs/tags/v1.0.0');
  });

  it.each(['HEAD', 'grafted, HEAD'])('returns an empty ref when no ref contains detached %s', async decoration => {
    vi.spyOn(Exec, 'getExecOutput').mockImplementation((cmd, args): Promise<ExecOutput> => {
      const fullCmd = `${cmd} ${args?.join(' ')}`;
      let result = '';
      switch (fullCmd) {
        case 'git branch --show-current':
          result = '';
          break;
        case 'git show -s --pretty=%D':
          result = decoration;
          break;
        case 'git for-each-ref --format=%(refname) --contains HEAD --sort=-committerdate refs/heads/':
          result = '';
          break;
        case 'git for-each-ref --format=%(refname) --contains HEAD --sort=-committerdate refs/remotes/':
          result = '';
          break;
        case 'git tag --contains HEAD':
          result = '';
          break;
      }
      return Promise.resolve({
        stdout: result,
        stderr: '',
        exitCode: 0
      });
    });
    expect(await Git.ref()).toEqual('');
  });

  it('handles remote ref without branch pattern when inferring from remote', async () => {
    vi.spyOn(Exec, 'getExecOutput').mockImplementation((cmd, args): Promise<ExecOutput> => {
      const fullCmd = `${cmd} ${args?.join(' ')}`;
      let result = '';
      switch (fullCmd) {
        case 'git branch --show-current':
          result = '';
          break;
        case 'git show -s --pretty=%D':
          result = 'HEAD';
          break;
        case 'git for-each-ref --format=%(refname) --contains HEAD --sort=-committerdate refs/heads/':
          result = '';
          break;
        case 'git for-each-ref --format=%(refname) --contains HEAD --sort=-committerdate refs/remotes/':
          result = 'refs/remotes/unusual-format';
          break;
      }
      return Promise.resolve({
        stdout: result,
        stderr: '',
        exitCode: 0
      });
    });
    const ref = await Git.ref();
    expect(ref).toEqual('refs/remotes/unusual-format');
  });

  it('returns mocked detached tag ref when commit also has branch decorations', async () => {
    vi.spyOn(Exec, 'getExecOutput').mockImplementation((cmd, args): Promise<ExecOutput> => {
      const fullCmd = `${cmd} ${args?.join(' ')}`;
      let result = '';
      switch (fullCmd) {
        case 'git branch --show-current':
          result = '';
          break;
        case 'git show -s --pretty=%D':
          result = 'HEAD, tag: v8.0.0, origin/release-branch';
          break;
        case 'git for-each-ref --format=%(refname) --points-at HEAD refs/tags/':
          result = 'refs/tags/v8.0.0';
          break;
      }
      return Promise.resolve({
        stdout: result,
        stderr: '',
        exitCode: 0
      });
    });
    const ref = await Git.ref();
    expect(ref).toEqual('refs/tags/v8.0.0');
  });

  it('returns mocked detached tag ref (shallow clone) when commit also has branch decorations', async () => {
    vi.spyOn(Exec, 'getExecOutput').mockImplementation((cmd, args): Promise<ExecOutput> => {
      const fullCmd = `${cmd} ${args?.join(' ')}`;
      let result = '';
      switch (fullCmd) {
        case 'git branch --show-current':
          result = '';
          break;
        case 'git show -s --pretty=%D':
          result = 'grafted, HEAD, tag: v8.0.0, origin/release-branch';
          break;
        case 'git for-each-ref --format=%(refname) --points-at HEAD refs/tags/':
          result = 'refs/tags/v8.0.0';
          break;
      }
      return Promise.resolve({
        stdout: result,
        stderr: '',
        exitCode: 0
      });
    });
    const ref = await Git.ref();
    expect(ref).toEqual('refs/tags/v8.0.0');
  });

  it('returns mocked detached tag ref when tag name contains a comma', async () => {
    vi.spyOn(Exec, 'getExecOutput').mockImplementation((cmd, args): Promise<ExecOutput> => {
      const fullCmd = `${cmd} ${args?.join(' ')}`;
      let result = '';
      switch (fullCmd) {
        case 'git branch --show-current':
          result = '';
          break;
        case 'git show -s --pretty=%D':
          result = 'HEAD, tag: release,with-comma, origin/release-branch';
          break;
        case 'git for-each-ref --format=%(refname) --points-at HEAD refs/tags/':
          result = 'refs/tags/release,with-comma';
          break;
      }
      return Promise.resolve({
        stdout: result,
        stderr: '',
        exitCode: 0
      });
    });
    const ref = await Git.ref();
    expect(ref).toEqual('refs/tags/release,with-comma');
  });
});

describe('fullCommit', () => {
  it('have been called', async () => {
    const execSpy = vi.spyOn(Exec, 'getExecOutput');
    try {
      await Git.fullCommit();
    } catch {
      // noop
    }
    expect(execSpy).toHaveBeenCalledWith(`git`, ['show', '--format=%H', 'HEAD', '--quiet', '--'], {
      silent: true,
      ignoreReturnCode: true
    });
  });
});

describe('shortCommit', () => {
  it('have been called', async () => {
    const execSpy = vi.spyOn(Exec, 'getExecOutput');
    try {
      await Git.shortCommit();
    } catch {
      // noop
    }
    expect(execSpy).toHaveBeenCalledWith(`git`, ['show', '--format=%h', 'HEAD', '--quiet', '--'], {
      silent: true,
      ignoreReturnCode: true
    });
  });
});

describe('tag', () => {
  it('have been called', async () => {
    const execSpy = vi.spyOn(Exec, 'getExecOutput');
    try {
      await Git.tag();
    } catch {
      // noop
    }
    expect(execSpy).toHaveBeenCalledWith(`git`, ['tag', '--points-at', 'HEAD', '--sort', '-version:creatordate'], {
      silent: true,
      ignoreReturnCode: true
    });
  });
});

describe('getCommitDate', () => {
  it('head', async () => {
    const date = await Git.commitDate('HEAD');
    expect(date).toBeInstanceOf(Date);
  });
});
