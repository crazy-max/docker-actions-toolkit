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
exports.Bake = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const build_1 = require("./build");
const buildx_1 = require("./buildx");
const context_1 = require("../context");
const exec_1 = require("../exec");
const util_1 = require("../util");
class Bake {
    constructor(opts) {
        this.buildx = (opts === null || opts === void 0 ? void 0 : opts.buildx) || new buildx_1.Buildx();
        this.metadataFilename = `bake-metadata-${util_1.Util.generateRandomString()}.json`;
    }
    getMetadataFilePath() {
        return path_1.default.join(context_1.Context.tmpDir(), this.metadataFilename);
    }
    resolveMetadata() {
        const metadataFile = this.getMetadataFilePath();
        if (!fs_1.default.existsSync(metadataFile)) {
            return undefined;
        }
        const content = fs_1.default.readFileSync(metadataFile, { encoding: 'utf-8' }).trim();
        if (content === 'null') {
            return undefined;
        }
        return JSON.parse(content);
    }
    resolveRefs(metadata) {
        if (!metadata) {
            metadata = this.resolveMetadata();
            if (!metadata) {
                return undefined;
            }
        }
        const refs = new Array();
        for (const key in metadata) {
            if ('buildx.build.ref' in metadata[key]) {
                refs.push(metadata[key]['buildx.build.ref']);
            }
        }
        return refs;
    }
    getDefinition(cmdOpts, execOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            execOptions = execOptions || { ignoreReturnCode: true };
            execOptions.ignoreReturnCode = true;
            if (cmdOpts.githubToken) {
                execOptions.env = Object.assign({}, process.env, {
                    BUILDX_BAKE_GIT_AUTH_TOKEN: cmdOpts.githubToken
                });
            }
            const args = ['bake'];
            let remoteDef;
            const files = [];
            const sources = [...(cmdOpts.files || []), cmdOpts.source];
            if (sources) {
                for (const source of sources.map(v => (v ? v.trim() : ''))) {
                    if (source.length == 0) {
                        continue;
                    }
                    if (!util_1.Util.isValidRef(source)) {
                        files.push(source);
                        continue;
                    }
                    if (remoteDef) {
                        throw new Error(`Only one remote bake definition can be defined`);
                    }
                    remoteDef = source;
                }
            }
            if (remoteDef) {
                args.push(remoteDef);
            }
            for (const file of files) {
                args.push('--file', file);
            }
            if (cmdOpts.overrides) {
                for (const override of cmdOpts.overrides) {
                    args.push('--set', override);
                }
            }
            if (cmdOpts.load) {
                args.push('--load');
            }
            if (cmdOpts.noCache) {
                args.push('--no-cache');
            }
            if (cmdOpts.provenance) {
                args.push('--provenance', cmdOpts.provenance);
            }
            if (cmdOpts.push) {
                args.push('--push');
            }
            if (cmdOpts.sbom) {
                args.push('--sbom', cmdOpts.sbom);
            }
            const printCmd = yield this.buildx.getCommand([...args, '--print', ...(cmdOpts.targets || [])]);
            return yield exec_1.Exec.getExecOutput(printCmd.command, printCmd.args, execOptions).then(res => {
                var _a, _b, _c;
                if (res.stderr.length > 0 && res.exitCode != 0) {
                    throw new Error(`cannot parse bake definitions: ${(_c = (_b = (_a = res.stderr.match(/(.*)\s*$/)) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : 'unknown error'}`);
                }
                return Bake.parseDefinition(res.stdout.trim());
            });
        });
    }
    static parseDefinition(dt) {
        return JSON.parse(dt);
    }
    static hasLocalExporter(def) {
        return build_1.Build.hasExporterType('local', Bake.exporters(def));
    }
    static hasTarExporter(def) {
        return build_1.Build.hasExporterType('tar', Bake.exporters(def));
    }
    static hasDockerExporter(def, load) {
        return load || build_1.Build.hasExporterType('docker', Bake.exporters(def));
    }
    static exporters(def) {
        const exporters = new Array();
        for (const key in def.target) {
            const target = def.target[key];
            if (target.output) {
                exporters.push(...target.output);
            }
        }
        return exporters;
    }
}
exports.Bake = Bake;
//# sourceMappingURL=bake.js.map