"use strict";
/**
 * Copyright 2025 actions-toolkit authors
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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cosign = void 0;
const core = __importStar(require("@actions/core"));
const bundle_1 = require("@sigstore/bundle");
const exec_1 = require("../exec");
const semver = __importStar(require("semver"));
const mediatype_1 = require("../types/oci/mediatype");
class Cosign {
    constructor(opts) {
        this.binPath = (opts === null || opts === void 0 ? void 0 : opts.binPath) || 'cosign';
        this._version = '';
        this._versionOnce = false;
    }
    isAvailable() {
        return __awaiter(this, void 0, void 0, function* () {
            const ok = yield exec_1.Exec.getExecOutput(this.binPath, [], {
                ignoreReturnCode: true,
                silent: true
            })
                .then(res => {
                if (res.stderr.length > 0 && res.exitCode != 0) {
                    core.debug(`Cosign.isAvailable cmd err: ${res.stderr.trim()}`);
                    return false;
                }
                return res.exitCode == 0;
            })
                .catch(error => {
                core.debug(`Cosign.isAvailable error: ${error}`);
                return false;
            });
            core.debug(`Cosign.isAvailable: ${ok}`);
            return ok;
        });
    }
    version() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._versionOnce) {
                return this._version;
            }
            this._versionOnce = true;
            this._version = yield exec_1.Exec.getExecOutput(this.binPath, ['version', '--json'], {
                ignoreReturnCode: true,
                silent: true
            }).then(res => {
                if (res.stderr.length > 0 && res.exitCode != 0) {
                    throw new Error(res.stderr.trim());
                }
                return JSON.parse(res.stdout.trim()).gitVersion;
            });
            return this._version;
        });
    }
    printVersion() {
        return __awaiter(this, void 0, void 0, function* () {
            yield exec_1.Exec.exec(this.binPath, ['version', '--json'], {
                failOnStdErr: false
            });
        });
    }
    versionSatisfies(range, version) {
        return __awaiter(this, void 0, void 0, function* () {
            const ver = version !== null && version !== void 0 ? version : (yield this.version());
            if (!ver) {
                core.debug(`Cosign.versionSatisfies false: undefined version`);
                return false;
            }
            const res = semver.satisfies(ver, range) || /^[0-9a-f]{7}$/.exec(ver) !== null;
            core.debug(`Cosign.versionSatisfies ${ver} statisfies ${range}: ${res}`);
            return res;
        });
    }
    static parseCommandOutput(logs) {
        let signatureManifestDigest;
        let signatureManifestFallbackDigest;
        let bundlePayload;
        let errors;
        for (const rawLine of logs.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line.startsWith('{') || !line.endsWith('}')) {
                continue;
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let obj;
            try {
                obj = JSON.parse(line);
            }
            catch (_a) {
                continue;
            }
            if (obj && Array.isArray(obj.errors) && obj.errors.length > 0) {
                errors = obj.errors;
            }
            // signature manifest digest
            if (!signatureManifestDigest && obj && Array.isArray(obj.manifests) && obj.manifests.length > 0) {
                const m0 = obj.manifests[0];
                if ((m0 === null || m0 === void 0 ? void 0 : m0.artifactType) === bundle_1.BUNDLE_V03_MEDIA_TYPE && typeof m0.digest === 'string') {
                    signatureManifestDigest = m0.digest;
                }
                else if ((m0 === null || m0 === void 0 ? void 0 : m0.artifactType) === mediatype_1.MEDIATYPE_EMPTY_JSON_V1 && typeof m0.digest === 'string') {
                    signatureManifestFallbackDigest = m0.digest;
                }
            }
            // signature payload
            if (!bundlePayload && obj && obj.mediaType === bundle_1.BUNDLE_V03_MEDIA_TYPE) {
                bundlePayload = obj;
            }
            if (bundlePayload && signatureManifestDigest) {
                break;
            }
        }
        if (!errors && !bundlePayload) {
            throw new Error(`Cannot find signature bundle from cosign command output: ${logs}`);
        }
        return {
            bundle: bundlePayload,
            signatureManifestDigest: signatureManifestDigest || signatureManifestFallbackDigest,
            errors: errors
        };
    }
}
exports.Cosign = Cosign;
//# sourceMappingURL=cosign.js.map