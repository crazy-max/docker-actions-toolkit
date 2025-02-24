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

import * as core from '@actions/core';

import {Buildx} from './buildx';
import {Exec} from '../exec';

import {BuilderInfo, Device, GCPolicy, NodeInfo} from '../types/buildx/builder';

export interface BuilderOpts {
  buildx?: Buildx;
}

export class Builder {
  private readonly buildx: Buildx;

  constructor(opts?: BuilderOpts) {
    this.buildx = opts?.buildx || new Buildx();
  }

  public async exists(name: string): Promise<boolean> {
    const cmd = await this.buildx.getCommand(['inspect', name]);

    const ok: boolean = await Exec.getExecOutput(cmd.command, cmd.args, {
      ignoreReturnCode: true,
      silent: true
    })
      .then(res => {
        if (res.stderr.length > 0 && res.exitCode != 0) {
          core.debug(`Builder.exists cmd err: ${res.stderr.trim()}`);
          return false;
        }
        return res.exitCode == 0;
      })
      .catch(error => {
        core.debug(`Builder.exists error: ${error}`);
        return false;
      });

    core.debug(`Builder.exists: ${ok}`);
    return ok;
  }

  public async inspect(name?: string): Promise<BuilderInfo> {
    // always enable debug for inspect command, so we can display additional
    // fields such as features: https://github.com/docker/buildx/pull/1854
    const envs = Object.assign({}, process.env, {
      DEBUG: '1'
    }) as {
      [key: string]: string;
    };

    const args = ['inspect'];
    if (name) {
      args.push(name);
    }

    const cmd = await this.buildx.getCommand(args);
    return await Exec.getExecOutput(cmd.command, cmd.args, {
      ignoreReturnCode: true,
      silent: true,
      env: envs
    }).then(res => {
      if (res.stderr.length > 0 && res.exitCode != 0) {
        throw new Error(res.stderr.trim());
      }
      return Builder.parseInspect(res.stdout);
    });
  }

  public static parseInspect(data: string): BuilderInfo {
    const builder: BuilderInfo = {
      nodes: []
    };
    let parsingType: string | undefined;
    let currentNode: NodeInfo = {};
    let currentGCPolicy: GCPolicy | undefined;
    let currentDevice: Device | undefined;
    let currentFile: string | undefined;
    for (const line of data.trim().split(`\n`)) {
      const [key, ...rest] = line.split(':');
      const lkey = key.toLowerCase();
      const value = rest.map(v => v.trim()).join(':');
      if (key.length == 0) {
        continue;
      }
      switch (true) {
        case lkey == 'name':
          parsingType = undefined;
          if (builder.name == undefined) {
            builder.name = value;
          } else {
            if (currentGCPolicy && currentNode.gcPolicy) {
              currentNode.gcPolicy.push(currentGCPolicy);
              currentGCPolicy = undefined;
            }
            if (currentNode.name) {
              builder.nodes.push(currentNode);
            }
            currentNode = {name: value};
          }
          break;
        case lkey == 'driver':
          parsingType = undefined;
          builder.driver = value;
          break;
        case lkey == 'last activity':
          parsingType = undefined;
          builder.lastActivity = new Date(value);
          break;
        case lkey == 'endpoint':
          parsingType = undefined;
          currentNode.endpoint = value;
          break;
        case lkey == 'driver options':
          parsingType = undefined;
          currentNode['driver-opts'] = (value.match(/([a-zA-Z0-9_.]+)="([^"]*)"/g) || []).map(v => v.replace(/^(.*)="(.*)"$/g, '$1=$2'));
          break;
        case lkey == 'status':
          parsingType = undefined;
          currentNode.status = value;
          break;
        case lkey == 'buildkit daemon flags':
        case lkey == 'flags': // buildx < v0.13
          parsingType = undefined;
          currentNode['buildkitd-flags'] = value;
          break;
        case lkey == 'buildkit version':
        case lkey == 'buildkit': // buildx < v0.13
          parsingType = undefined;
          currentNode.buildkit = value;
          break;
        case lkey == 'platforms': {
          parsingType = undefined;
          if (!value) {
            break;
          }
          let platforms: Array<string> = [];
          // if a preferred platform is being set then use only these
          // https://docs.docker.com/engine/reference/commandline/buildx_inspect/#get-information-about-a-builder-instance
          if (value.includes('*')) {
            for (const platform of value.split(', ')) {
              if (platform.includes('*')) {
                platforms.push(platform.replace(/\*/g, ''));
              }
            }
          } else {
            // otherwise set all platforms available
            platforms = value.split(', ');
          }
          currentNode.platforms = platforms.join(',');
          break;
        }
        case lkey == 'features':
          parsingType = 'features';
          currentNode.features = {};
          break;
        case lkey == 'labels':
          parsingType = 'label';
          currentNode.labels = {};
          break;
        case lkey == 'devices':
          parsingType = 'devices';
          currentNode.devices = currentNode.devices || [];
          break;
        case lkey.startsWith('gc policy rule#'):
          parsingType = 'gcpolicy';
          if (currentNode.gcPolicy && currentGCPolicy) {
            currentNode.gcPolicy.push(currentGCPolicy);
            currentGCPolicy = undefined;
          }
          break;
        case lkey.startsWith('file#'):
          parsingType = 'file';
          currentFile = key.split('#')[1];
          currentNode.files = currentNode.files || {};
          currentNode.files[currentFile] = '';
          break;
        default: {
          if (parsingType && parsingType !== 'devices' && currentNode.devices && currentDevice) {
            currentNode.devices.push(currentDevice);
            currentDevice = undefined;
          }
          switch (parsingType || '') {
            case 'features': {
              currentNode.features = currentNode.features || {};
              currentNode.features[key.trim()] = Boolean(value);
              break;
            }
            case 'label': {
              currentNode.labels = currentNode.labels || {};
              currentNode.labels[key.trim()] = value;
              break;
            }
            case 'devices': {
              switch (lkey.trim()) {
                case 'name': {
                  if (currentNode.devices && currentDevice) {
                    currentNode.devices.push(currentDevice);
                  }
                  currentDevice = {};
                  currentDevice.name = value;
                  break;
                }
                case 'on-demand': {
                  if (currentDevice && value) {
                    currentDevice.onDemand = value == 'true';
                  }
                  break;
                }
                case 'automatically allowed': {
                  if (currentDevice && value) {
                    currentDevice.autoAllow = value == 'true';
                  }
                  break;
                }
                case 'annotations': {
                  if (currentDevice) {
                    currentDevice.annotations = currentDevice.annotations || {};
                  }
                  break;
                }
                default: {
                  if (currentDevice && currentDevice.annotations) {
                    currentDevice.annotations[key.trim()] = value;
                  }
                }
              }
              break;
            }
            case 'gcpolicy': {
              currentNode.gcPolicy = currentNode.gcPolicy || [];
              currentGCPolicy = currentGCPolicy || {};
              switch (lkey.trim()) {
                case 'all': {
                  currentGCPolicy.all = value == 'true';
                  break;
                }
                case 'filters': {
                  if (value) {
                    currentGCPolicy.filter = value.split(',');
                  }
                  break;
                }
                case 'keep duration': {
                  currentGCPolicy.keepDuration = value;
                  break;
                }
                case 'keep bytes': {
                  currentGCPolicy.keepBytes = value;
                  break;
                }
                case 'reserved space': {
                  currentGCPolicy.reservedSpace = value;
                  break;
                }
                case 'max used space': {
                  currentGCPolicy.maxUsedSpace = value;
                  break;
                }
                case 'min free space': {
                  currentGCPolicy.minFreeSpace = value;
                  break;
                }
              }
              break;
            }
            case 'file': {
              if (currentFile && currentNode.files) {
                if (currentNode.files[currentFile].length > 0) {
                  currentNode.files[currentFile] += '\n';
                }
                currentNode.files[currentFile] += line.replace(/^\s>\s?/, '');
              }
              break;
            }
          }
        }
      }
    }
    if (currentDevice && currentNode.devices) {
      currentNode.devices.push(currentDevice);
    }
    if (currentGCPolicy && currentNode.gcPolicy) {
      currentNode.gcPolicy.push(currentGCPolicy);
    }
    if (currentNode.name) {
      builder.nodes.push(currentNode);
    }
    return builder;
  }
}
