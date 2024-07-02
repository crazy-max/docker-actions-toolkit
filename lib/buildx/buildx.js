"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Buildx = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const core = __importStar(require("@actions/core"));
const semver = __importStar(require("semver"));
const docker_1 = require("../docker/docker");
const exec_1 = require("../exec");
class Buildx {
    constructor(opts) {
        this._standalone = opts === null || opts === void 0 ? void 0 : opts.standalone;
        this._version = '';
        this._versionOnce = false;
    }
    static get configDir() {
        return process.env.BUILDX_CONFIG || path_1.default.join(docker_1.Docker.configDir, 'buildx');
    }
    static get refsDir() {
        return path_1.default.join(Buildx.configDir, 'refs');
    }
    static get refsGroupDir() {
        return path_1.default.join(Buildx.refsDir, '__group__');
    }
    static get certsDir() {
        return path_1.default.join(Buildx.configDir, 'certs');
    }
    isStandalone() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const standalone = (_a = this._standalone) !== null && _a !== void 0 ? _a : !(yield docker_1.Docker.isAvailable());
            core.debug(`Buildx.isStandalone: ${standalone}`);
            return standalone;
        });
    }
    getCommand(args) {
        return __awaiter(this, void 0, void 0, function* () {
            const standalone = yield this.isStandalone();
            return {
                command: standalone ? 'buildx' : 'docker',
                args: standalone ? args : ['buildx', ...args]
            };
        });
    }
    isAvailable() {
        return __awaiter(this, void 0, void 0, function* () {
            const cmd = yield this.getCommand([]);
            const ok = yield exec_1.Exec.getExecOutput(cmd.command, cmd.args, {
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
        });
    }
    version() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._versionOnce) {
                return this._version;
            }
            this._versionOnce = true;
            const cmd = yield this.getCommand(['version']);
            this._version = yield exec_1.Exec.getExecOutput(cmd.command, cmd.args, {
                ignoreReturnCode: true,
                silent: true
            }).then(res => {
                if (res.stderr.length > 0 && res.exitCode != 0) {
                    throw new Error(res.stderr.trim());
                }
                return Buildx.parseVersion(res.stdout.trim());
            });
            return this._version;
        });
    }
    printVersion() {
        return __awaiter(this, void 0, void 0, function* () {
            const cmd = yield this.getCommand(['version']);
            yield exec_1.Exec.exec(cmd.command, cmd.args, {
                failOnStdErr: false
            });
        });
    }
    static parseVersion(stdout) {
        const matches = /\sv?([0-9a-f]{7}|[0-9.]+)/.exec(stdout);
        if (!matches) {
            throw new Error(`Cannot parse buildx version`);
        }
        return matches[1];
    }
    versionSatisfies(range, version) {
        return __awaiter(this, void 0, void 0, function* () {
            const ver = version !== null && version !== void 0 ? version : (yield this.version());
            if (!ver) {
                core.debug(`Buildx.versionSatisfies false: undefined version`);
                return false;
            }
            const res = semver.satisfies(ver, range) || /^[0-9a-f]{7}$/.exec(ver) !== null;
            core.debug(`Buildx.versionSatisfies ${ver} statisfies ${range}: ${res}`);
            return res;
        });
    }
    static resolveCertsDriverOpts(driver, endpoint, cert) {
        let url;
        try {
            url = new URL(endpoint);
        }
        catch (e) {
            return [];
        }
        if (url.protocol != 'tcp:') {
            return [];
        }
        const driverOpts = [];
        if (Object.keys(cert).length == 0) {
            return driverOpts;
        }
        let host = url.hostname;
        if (url.port.length > 0) {
            host += `-${url.port}`;
        }
        if (cert.cacert !== undefined) {
            const cacertpath = path_1.default.join(Buildx.certsDir, `cacert_${host}.pem`);
            fs_1.default.writeFileSync(cacertpath, cert.cacert);
            driverOpts.push(`cacert=${cacertpath}`);
        }
        if (cert.cert !== undefined) {
            const certpath = path_1.default.join(Buildx.certsDir, `cert_${host}.pem`);
            fs_1.default.writeFileSync(certpath, cert.cert);
            driverOpts.push(`cert=${certpath}`);
        }
        if (cert.key !== undefined) {
            const keypath = path_1.default.join(Buildx.certsDir, `key_${host}.pem`);
            fs_1.default.writeFileSync(keypath, cert.key);
            driverOpts.push(`key=${keypath}`);
        }
        if (driver != 'remote') {
            return [];
        }
        return driverOpts;
    }
    static refs(opts, refs = {}) {
        const { dir, builderName, nodeName, since } = opts;
        let dirpath = path_1.default.resolve(dir);
        if (opts.builderName) {
            dirpath = path_1.default.join(dirpath, opts.builderName);
        }
        if (opts.nodeName) {
            dirpath = path_1.default.join(dirpath, opts.nodeName);
        }
        if (!fs_1.default.existsSync(dirpath)) {
            return refs;
        }
        const files = fs_1.default.readdirSync(dirpath);
        for (const file of files) {
            const filePath = path_1.default.join(dirpath, file);
            const stat = fs_1.default.statSync(filePath);
            if (stat.isDirectory()) {
                const nopts = Object.assign({}, opts);
                if (!builderName) {
                    if (file === '__group__') {
                        continue;
                    }
                    nopts.builderName = file;
                }
                else if (!nodeName) {
                    nopts.nodeName = file;
                }
                Buildx.refs(nopts, refs);
            }
            else {
                if (since && stat.mtime < since) {
                    continue;
                }
                const localState = JSON.parse(fs_1.default.readFileSync(filePath, 'utf8'));
                const ref = `${builderName}/${nodeName}/${file}`;
                refs[ref] = localState;
            }
        }
        return refs;
    }
}
exports.Buildx = Buildx;
Buildx.containerNamePrefix = 'buildx_buildkit_';
//# sourceMappingURL=buildx.js.map