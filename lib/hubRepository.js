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
exports.HubRepository = void 0;
const httpm = __importStar(require("@actions/http-client"));
const os_1 = __importDefault(require("os"));
const core = __importStar(require("@actions/core"));
const tc = __importStar(require("@actions/tool-cache"));
const fs_1 = __importDefault(require("fs"));
const mediatype_1 = require("./types/oci/mediatype");
const mediatype_2 = require("./types/docker/mediatype");
const dockerhub_1 = require("./dockerhub");
class HubRepository {
    constructor(repository, token) {
        this.repo = repository;
        this.token = token;
    }
    static build(repository) {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.getToken(repository);
            return new HubRepository(repository, token);
        });
    }
    getPlatformManifest(tagOrDigest, os) {
        return __awaiter(this, void 0, void 0, function* () {
            const index = yield this.getManifest(tagOrDigest);
            if (index.mediaType != mediatype_1.MEDIATYPE_IMAGE_INDEX_V1 && index.mediaType != mediatype_2.MEDIATYPE_IMAGE_MANIFEST_LIST_V2) {
                core.error(`Unsupported image media type: ${index.mediaType}`);
                throw new Error(`Unsupported image media type: ${index.mediaType}`);
            }
            const digest = HubRepository.getPlatformManifestDigest(index, os);
            return yield this.getManifest(digest);
        });
    }
    // Unpacks the image layers and returns the path to the extracted image.
    // Only OCI indexes/manifest list are supported for now.
    extractImage(tag, destDir) {
        return __awaiter(this, void 0, void 0, function* () {
            const manifest = yield this.getPlatformManifest(tag);
            const paths = manifest.layers.map((layer) => __awaiter(this, void 0, void 0, function* () {
                const url = this.blobUrl(layer.digest);
                return yield tc.downloadTool(url, undefined, undefined, {
                    authorization: `Bearer ${this.token}`
                });
            }));
            let files = yield Promise.all(paths);
            let extractFolder;
            if (!destDir) {
                extractFolder = yield tc.extractTar(files[0]);
                files = files.slice(1);
            }
            else {
                extractFolder = destDir;
            }
            yield Promise.all(files.map((file) => __awaiter(this, void 0, void 0, function* () {
                return yield tc.extractTar(file, extractFolder);
            })));
            fs_1.default.readdirSync(extractFolder).forEach(file => {
                core.info(`extractImage(${this.repo}:${tag}) file: ${file}`);
            });
            return extractFolder;
        });
    }
    static getToken(repo) {
        return __awaiter(this, void 0, void 0, function* () {
            const url = `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull`;
            const resp = yield this.http.get(url);
            const body = yield resp.readBody();
            const statusCode = resp.message.statusCode || 500;
            if (statusCode != 200) {
                throw dockerhub_1.DockerHub.parseError(resp, body);
            }
            const json = JSON.parse(body);
            return json.token;
        });
    }
    blobUrl(digest) {
        return `https://registry-1.docker.io/v2/${this.repo}/blobs/${digest}`;
    }
    getManifest(tagOrDigest) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.registryGet(tagOrDigest, 'manifests', [mediatype_1.MEDIATYPE_IMAGE_INDEX_V1, mediatype_2.MEDIATYPE_IMAGE_MANIFEST_LIST_V2, mediatype_1.MEDIATYPE_IMAGE_MANIFEST_V1, mediatype_2.MEDIATYPE_IMAGE_MANIFEST_V2]);
        });
    }
    getJSONBlob(tagOrDigest) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.registryGet(tagOrDigest, 'blobs', [mediatype_1.MEDIATYPE_IMAGE_CONFIG_V1, mediatype_2.MEDIATYPE_IMAGE_CONFIG_V1]);
        });
    }
    registryGet(tagOrDigest, endpoint, accept) {
        return __awaiter(this, void 0, void 0, function* () {
            const url = `https://registry-1.docker.io/v2/${this.repo}/${endpoint}/${tagOrDigest}`;
            const headers = {
                Authorization: `Bearer ${this.token}`,
                Accept: accept.join(', ')
            };
            const resp = yield HubRepository.http.get(url, headers);
            const body = yield resp.readBody();
            const statusCode = resp.message.statusCode || 500;
            if (statusCode != 200) {
                core.error(`registryGet(${this.repo}:${tagOrDigest}) failed: ${statusCode} ${body}`);
                throw dockerhub_1.DockerHub.parseError(resp, body);
            }
            return JSON.parse(body);
        });
    }
    static getPlatformManifestDigest(index, osOverride) {
        // This doesn't handle all possible platforms normalizations, but it's good enough for now.
        let pos = osOverride || os_1.default.platform();
        if (pos == 'win32') {
            pos = 'windows';
        }
        let arch = os_1.default.arch();
        if (arch == 'x64') {
            arch = 'amd64';
        }
        let variant = '';
        if (arch == 'arm') {
            variant = 'v7';
        }
        const manifest = index.manifests.find(m => {
            if (!m.platform) {
                return false;
            }
            if (m.platform.os != pos) {
                core.debug(`Skipping manifest ${m.digest} because of os: ${m.platform.os} != ${pos}`);
                return false;
            }
            if (m.platform.architecture != arch) {
                core.debug(`Skipping manifest ${m.digest} because of arch: ${m.platform.architecture} != ${arch}`);
                return false;
            }
            if ((m.platform.variant || '') != variant) {
                core.debug(`Skipping manifest ${m.digest} because of variant: ${m.platform.variant} != ${variant}`);
                return false;
            }
            return true;
        });
        if (!manifest) {
            core.error(`Cannot find manifest for ${pos}/${arch}/${variant}`);
            throw new Error(`Cannot find manifest for ${pos}/${arch}/${variant}`);
        }
        return manifest.digest;
    }
}
exports.HubRepository = HubRepository;
HubRepository.http = new httpm.HttpClient('setup-docker-action');
//# sourceMappingURL=hubRepository.js.map