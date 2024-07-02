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
exports.GitHub = void 0;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const he_1 = __importDefault(require("he"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const generated_1 = require("@actions/artifact/lib/generated");
const artifact_twirp_client_1 = require("@actions/artifact/lib/internal/shared/artifact-twirp-client");
const config_1 = require("@actions/artifact/lib/internal/shared/config");
const util_1 = require("@actions/artifact/lib/internal/shared/util");
const retention_1 = require("@actions/artifact/lib/internal/upload/retention");
const artifact_1 = require("@actions/artifact");
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const storage_blob_1 = require("@azure/storage-blob");
const jwt_decode_1 = require("jwt-decode");
const util_2 = require("./util");
class GitHub {
    constructor(opts) {
        this.octokit = github.getOctokit(`${opts === null || opts === void 0 ? void 0 : opts.token}`);
    }
    repoData() {
        return this.octokit.rest.repos.get(Object.assign({}, github.context.repo)).then(response => response.data);
    }
    static get context() {
        return github.context;
    }
    static get serverURL() {
        return process.env.GITHUB_SERVER_URL || 'https://github.com';
    }
    static get apiURL() {
        return process.env.GITHUB_API_URL || 'https://api.github.com';
    }
    static get repository() {
        return `${github.context.repo.owner}/${github.context.repo.repo}`;
    }
    static get runId() {
        return process.env.GITHUB_RUN_ID ? +process.env.GITHUB_RUN_ID : github.context.runId;
    }
    static get runAttempt() {
        // TODO: runAttempt is not yet part of github.context but will be in a
        //  future release of @actions/github package: https://github.com/actions/toolkit/commit/faa425440f86f9c16587a19dfb59491253a2c92a
        return process.env.GITHUB_RUN_ATTEMPT ? +process.env.GITHUB_RUN_ATTEMPT : 1;
    }
    static workflowRunURL(setAttempts) {
        return `${GitHub.serverURL}/${GitHub.repository}/actions/runs/${GitHub.runId}${setAttempts ? `/attempts/${GitHub.runAttempt}` : ''}`;
    }
    static get actionsRuntimeToken() {
        const token = process.env['ACTIONS_RUNTIME_TOKEN'] || '';
        return token ? (0, jwt_decode_1.jwtDecode)(token) : undefined;
    }
    static printActionsRuntimeTokenACs() {
        return __awaiter(this, void 0, void 0, function* () {
            let jwt;
            try {
                jwt = GitHub.actionsRuntimeToken;
            }
            catch (e) {
                throw new Error(`Cannot parse GitHub Actions Runtime Token: ${e.message}`);
            }
            if (!jwt) {
                throw new Error(`ACTIONS_RUNTIME_TOKEN not set`);
            }
            try {
                JSON.parse(`${jwt.ac}`).forEach(ac => {
                    let permission;
                    switch (ac.Permission) {
                        case 1:
                            permission = 'read';
                            break;
                        case 2:
                            permission = 'write';
                            break;
                        case 3:
                            permission = 'read/write';
                            break;
                        default:
                            permission = `unimplemented (${ac.Permission})`;
                    }
                    core.info(`${ac.Scope}: ${permission}`);
                });
            }
            catch (e) {
                throw new Error(`Cannot parse GitHub Actions Runtime Token ACs: ${e.message}`);
            }
        });
    }
    static uploadArtifact(opts) {
        return __awaiter(this, void 0, void 0, function* () {
            if ((0, config_1.isGhes)()) {
                throw new Error('@actions/artifact v2.0.0+ is currently not supported on GHES.');
            }
            const artifactName = path_1.default.basename(opts.filename);
            const backendIds = (0, util_1.getBackendIdsFromToken)();
            const artifactClient = (0, artifact_twirp_client_1.internalArtifactTwirpClient)();
            core.info(`Uploading ${artifactName} to blob storage`);
            const createArtifactReq = {
                workflowRunBackendId: backendIds.workflowRunBackendId,
                workflowJobRunBackendId: backendIds.workflowJobRunBackendId,
                name: artifactName,
                version: 4
            };
            const expiresAt = (0, retention_1.getExpiration)(opts === null || opts === void 0 ? void 0 : opts.retentionDays);
            if (expiresAt) {
                createArtifactReq.expiresAt = expiresAt;
            }
            const createArtifactResp = yield artifactClient.CreateArtifact(createArtifactReq);
            if (!createArtifactResp.ok) {
                throw new artifact_1.InvalidResponseError('cannot create artifact client');
            }
            let uploadByteCount = 0;
            const blobClient = new storage_blob_1.BlobClient(createArtifactResp.signedUploadUrl);
            const blockBlobClient = blobClient.getBlockBlobClient();
            const headers = {
                blobContentDisposition: `attachment; filename="${artifactName}"`
            };
            if (opts.mimeType) {
                headers.blobContentType = opts.mimeType;
            }
            core.debug(`Upload headers: ${JSON.stringify(headers)}`);
            try {
                core.info('Beginning upload of artifact content to blob storage');
                yield blockBlobClient.uploadFile(opts.filename, {
                    blobHTTPHeaders: headers,
                    onProgress: (progress) => {
                        core.info(`Uploaded bytes ${progress.loadedBytes}`);
                        uploadByteCount = progress.loadedBytes;
                    }
                });
            }
            catch (error) {
                if (artifact_1.NetworkError.isNetworkErrorCode(error === null || error === void 0 ? void 0 : error.code)) {
                    throw new artifact_1.NetworkError(error === null || error === void 0 ? void 0 : error.code);
                }
                throw error;
            }
            core.info('Finished uploading artifact content to blob storage!');
            const sha256Hash = crypto_1.default.createHash('sha256').update(fs_1.default.readFileSync(opts.filename)).digest('hex');
            core.info(`SHA256 hash of uploaded artifact is ${sha256Hash}`);
            const finalizeArtifactReq = {
                workflowRunBackendId: backendIds.workflowRunBackendId,
                workflowJobRunBackendId: backendIds.workflowJobRunBackendId,
                name: artifactName,
                size: uploadByteCount ? uploadByteCount.toString() : '0'
            };
            if (sha256Hash) {
                finalizeArtifactReq.hash = generated_1.StringValue.create({
                    value: `sha256:${sha256Hash}`
                });
            }
            core.info(`Finalizing artifact upload`);
            const finalizeArtifactResp = yield artifactClient.FinalizeArtifact(finalizeArtifactReq);
            if (!finalizeArtifactResp.ok) {
                throw new artifact_1.InvalidResponseError('Cannot finalize artifact upload');
            }
            const artifactId = BigInt(finalizeArtifactResp.artifactId);
            core.info(`Artifact successfully finalized (${artifactId})`);
            const artifactURL = `${GitHub.workflowRunURL()}/artifacts/${artifactId}`;
            core.info(`Artifact download URL: ${artifactURL}`);
            return {
                id: Number(artifactId),
                filename: artifactName,
                size: uploadByteCount,
                url: artifactURL
            };
        });
    }
    static writeBuildSummary(opts) {
        return __awaiter(this, void 0, void 0, function* () {
            // can't use original core.summary.addLink due to the need to make
            // EOL optional
            const addLink = function (text, url, addEOL = false) {
                return `<a href="${url}">${text}</a>` + (addEOL ? os_1.default.EOL : '');
            };
            const refsSize = Object.keys(opts.exportRes.refs).length;
            // we just need the last two parts of the URL as they are always relative
            // to the workflow run URL otherwise URL could be broken if GitHub
            // repository name is part of a secret value used in the workflow. e.g.:
            //  artifact: https://github.com/docker/actions-toolkit/actions/runs/9552208295/artifacts/1609622746
            //  workflow: https://github.com/docker/actions-toolkit/actions/runs/9552208295
            // https://github.com/docker/actions-toolkit/issues/367
            const artifactRelativeURL = `./${GitHub.runId}/${opts.uploadRes.url.split('/').slice(-2).join('/')}`;
            // prettier-ignore
            const sum = core.summary
                .addHeading('Docker Build summary', 2)
                .addRaw(`<p>`)
                .addRaw(`For a detailed look at the build, download the following build record archive and import it into Docker Desktop's Builds view. `)
                .addBreak()
                .addRaw(`Build records include details such as timing, dependencies, results, logs, traces, and other information about a build. `)
                .addRaw(addLink('Learn more', 'https://www.docker.com/blog/new-beta-feature-deep-dive-into-github-actions-docker-builds-with-docker-desktop/?utm_source=github&utm_medium=actions'))
                .addRaw('</p>')
                .addRaw(`<p>`)
                .addRaw(`:arrow_down: ${addLink(`<strong>${util_2.Util.stringToUnicodeEntities(opts.uploadRes.filename)}</strong>`, artifactRelativeURL)} (${util_2.Util.formatFileSize(opts.uploadRes.size)} - includes <strong>${refsSize} build record${refsSize > 1 ? 's' : ''}</strong>)`)
                .addRaw(`</p>`)
                .addRaw(`<p>`)
                .addRaw(`Find this useful? `)
                .addRaw(addLink('Let us know', 'https://docs.docker.com/feedback/gha-build-summary'))
                .addRaw('</p>');
            // Preview
            sum.addRaw('<p>');
            const summaryTableData = [
                [
                    { header: true, data: 'ID' },
                    { header: true, data: 'Name' },
                    { header: true, data: 'Status' },
                    { header: true, data: 'Cached' },
                    { header: true, data: 'Duration' }
                ]
            ];
            let buildError;
            for (const ref in opts.exportRes.summaries) {
                if (Object.prototype.hasOwnProperty.call(opts.exportRes.summaries, ref)) {
                    const summary = opts.exportRes.summaries[ref];
                    // prettier-ignore
                    summaryTableData.push([
                        { data: `<code>${ref.substring(0, 6).toUpperCase()}</code>` },
                        { data: `<strong>${util_2.Util.stringToUnicodeEntities(summary.name)}</strong>` },
                        { data: `${summary.status === 'completed' ? ':white_check_mark:' : summary.status === 'canceled' ? ':no_entry_sign:' : ':x:'} ${summary.status}` },
                        { data: `${summary.numCachedSteps > 0 ? Math.round((summary.numCachedSteps / summary.numTotalSteps) * 100) : 0}%` },
                        { data: summary.duration }
                    ]);
                    if (summary.error) {
                        buildError = summary.error;
                    }
                }
            }
            sum.addTable([...summaryTableData]);
            sum.addRaw(`</p>`);
            // Build error
            if (buildError) {
                sum.addRaw(`<blockquote>`);
                if (util_2.Util.countLines(buildError) > 10) {
                    // prettier-ignore
                    sum
                        .addRaw(`<details><summary><strong>Error</strong></summary>`)
                        .addCodeBlock(he_1.default.encode(buildError), 'text')
                        .addRaw(`</details>`);
                }
                else {
                    // prettier-ignore
                    sum
                        .addRaw(`<strong>Error</strong>`)
                        .addBreak()
                        .addRaw(`<p>`)
                        .addCodeBlock(he_1.default.encode(buildError), 'text')
                        .addRaw(`</p>`);
                }
                sum.addRaw(`</blockquote>`);
            }
            // Build inputs
            if (opts.inputs) {
                // prettier-ignore
                sum.addRaw(`<details><summary><strong>Build inputs</strong></summary>`)
                    .addCodeBlock(js_yaml_1.default.dump(opts.inputs, {
                    indent: 2,
                    lineWidth: -1
                }), 'yaml')
                    .addRaw(`</details>`);
            }
            // Bake definition
            if (opts.bakeDefinition) {
                // prettier-ignore
                sum.addRaw(`<details><summary><strong>Bake definition</strong></summary>`)
                    .addCodeBlock(JSON.stringify(opts.bakeDefinition, null, 2), 'json')
                    .addRaw(`</details>`);
            }
            core.info(`Writing summary`);
            yield sum.addSeparator().write();
        });
    }
    static annotateBuildWarnings(source, warnings) {
        return __awaiter(this, void 0, void 0, function* () {
            (warnings !== null && warnings !== void 0 ? warnings : []).forEach(warning => {
                var _a;
                if (!warning.detail || !warning.short) {
                    return;
                }
                const title = warning.detail.map(encoded => atob(encoded)).join(' ');
                let message = atob(warning.short).replace(/\s\(line \d+\)$/, '');
                if (warning.url) {
                    // https://github.com/docker/buildx/blob/d8c9ebde1fdcf659f1fa3efa6ccc27a28b0f1564/commands/build.go#L854
                    message += `\nMore info: ${warning.url}`;
                }
                // GitHub annotations don't clearly show ranges of lines, so we'll just
                // show the first line
                const startLine = warning.range && warning.range.length > 0 ? (_a = warning.range[0]) === null || _a === void 0 ? void 0 : _a.start.line : undefined;
                // TODO: When GitHub annotations support showing ranges properly, we can use this code
                // let startLine: number | undefined, endLine: number | undefined;
                // for (const range of warning.range ?? []) {
                //   if (range.start.line && (!startLine || range.start.line < startLine)) {
                //     startLine = range.start.line;
                //   }
                //   if (range.end.line && (!endLine || range.end.line > endLine)) {
                //     endLine = range.end.line;
                //   }
                // }
                core.warning(message, {
                    title: title,
                    file: source,
                    startLine: startLine
                });
            });
        });
    }
}
exports.GitHub = GitHub;
//# sourceMappingURL=github.js.map