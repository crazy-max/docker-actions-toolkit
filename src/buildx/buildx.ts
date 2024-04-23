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

import fs from 'fs';
import path from 'path';
import * as core from '@actions/core';
import * as semver from 'semver';

import {Docker} from '../docker/docker';
import {Exec} from '../exec';

import {ExecOptions} from '@actions/exec';
import {LintResults} from '../types/buildkit';
import {Cert} from '../types/buildx';

export interface BuildxOpts {
  standalone?: boolean;
}

export class Buildx {
  private _version: string;
  private _versionOnce: boolean;
  private readonly _standalone: boolean | undefined;

  public static readonly containerNamePrefix = 'buildx_buildkit_';

  constructor(opts?: BuildxOpts) {
    this._standalone = opts?.standalone;
    this._version = '';
    this._versionOnce = false;
  }

  static get configDir(): string {
    return process.env.BUILDX_CONFIG || path.join(Docker.configDir, 'buildx');
  }

  static get certsDir(): string {
    return path.join(Buildx.configDir, 'certs');
  }

  public async isStandalone(): Promise<boolean> {
    const standalone = this._standalone ?? !(await Docker.isAvailable());
    core.debug(`Buildx.isStandalone: ${standalone}`);
    return standalone;
  }

  public async getCommand(args: Array<string>) {
    const standalone = await this.isStandalone();
    return {
      command: standalone ? 'buildx' : 'docker',
      args: standalone ? args : ['buildx', ...args]
    };
  }

  public async isAvailable(): Promise<boolean> {
    const cmd = await this.getCommand([]);

    const ok: boolean = await Exec.getExecOutput(cmd.command, cmd.args, {
      ignoreReturnCode: true,
      silent: true
    })
      .then(res => {
        if (res.stderr.length > 0 && res.exitCode != 0) {
          core.debug(`Buildx.isAvailable cmd err: ${res.stderr.trim()}`);
          return false;
        }
        return res.exitCode == 0;
      })
      .catch(error => {
        core.debug(`Buildx.isAvailable error: ${error}`);
        return false;
      });

    core.debug(`Buildx.isAvailable: ${ok}`);
    return ok;
  }

  public async version(): Promise<string> {
    if (this._versionOnce) {
      return this._version;
    }
    this._versionOnce = true;
    const cmd = await this.getCommand(['version']);
    this._version = await Exec.getExecOutput(cmd.command, cmd.args, {
      ignoreReturnCode: true,
      silent: true
    }).then(res => {
      if (res.stderr.length > 0 && res.exitCode != 0) {
        throw new Error(res.stderr.trim());
      }
      return Buildx.parseVersion(res.stdout.trim());
    });
    return this._version;
  }

  public async printVersion() {
    const cmd = await this.getCommand(['version']);
    await Exec.exec(cmd.command, cmd.args, {
      failOnStdErr: false
    });
  }

  public static parseVersion(stdout: string): string {
    const matches = /\sv?([0-9a-f]{7}|[0-9.]+)/.exec(stdout);
    if (!matches) {
      throw new Error(`Cannot parse buildx version`);
    }
    return matches[1];
  }

  public async versionSatisfies(range: string, version?: string): Promise<boolean> {
    const ver = version ?? (await this.version());
    if (!ver) {
      core.debug(`Buildx.versionSatisfies false: undefined version`);
      return false;
    }
    const res = semver.satisfies(ver, range) || /^[0-9a-f]{7}$/.exec(ver) !== null;
    core.debug(`Buildx.versionSatisfies ${ver} statisfies ${range}: ${res}`);
    return res;
  }

  public static resolveCertsDriverOpts(driver: string, endpoint: string, cert: Cert): Array<string> {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch (e) {
      return [];
    }
    if (url.protocol != 'tcp:') {
      return [];
    }
    const driverOpts: Array<string> = [];
    if (Object.keys(cert).length == 0) {
      return driverOpts;
    }
    let host = url.hostname;
    if (url.port.length > 0) {
      host += `-${url.port}`;
    }
    if (cert.cacert !== undefined) {
      const cacertpath = path.join(Buildx.certsDir, `cacert_${host}.pem`);
      fs.writeFileSync(cacertpath, cert.cacert);
      driverOpts.push(`cacert=${cacertpath}`);
    }
    if (cert.cert !== undefined) {
      const certpath = path.join(Buildx.certsDir, `cert_${host}.pem`);
      fs.writeFileSync(certpath, cert.cert);
      driverOpts.push(`cert=${certpath}`);
    }
    if (cert.key !== undefined) {
      const keypath = path.join(Buildx.certsDir, `key_${host}.pem`);
      fs.writeFileSync(keypath, cert.key);
      driverOpts.push(`key=${keypath}`);
    }
    if (driver != 'remote') {
      return [];
    }
    return driverOpts;
  }

  public async lint(cmd: string, args: Array<string>, execOptions?: ExecOptions): Promise<LintResults | undefined> {
    if (!(await this.versionSatisfies('>=0.14.0'))) {
      core.debug(`Buildx version does not support lint (>=0.14.0)`);
      return undefined;
    }

    execOptions = execOptions || {ignoreReturnCode: true};
    execOptions.ignoreReturnCode = true;
    execOptions.env = Object.assign({}, execOptions.env || process.env, {
      BUILDX_EXPERIMENTAL: '1'
    }) as {
      [key: string]: string;
    };

    return await Exec.getExecOutput(cmd, [...args, '--print=lint,format=json,ignorestatus=true'], execOptions).then(execOutput => {
      if (execOutput.stderr.length > 0 && execOutput.exitCode != 0) {
        throw new Error(`lint failed with: ${execOutput.stderr.match(/(.*)\s*$/)?.[0]?.trim() ?? 'unknown error'}`);
      }
      return <LintResults>JSON.parse(execOutput.stdout);
    });
  }
}
