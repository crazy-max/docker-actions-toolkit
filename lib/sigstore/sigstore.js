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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sigstore = void 0;
const crypto_1 = require("crypto");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const core = __importStar(require("@actions/core"));
const bundle_1 = require("@sigstore/bundle");
const sign_1 = require("@sigstore/sign");
const cosign_1 = require("../cosign/cosign");
const exec_1 = require("../exec");
const github_1 = require("../github");
const imagetools_1 = require("../buildx/imagetools");
const intoto_1 = require("../types/intoto/intoto");
const sigstore_1 = require("../types/sigstore/sigstore");
class Sigstore {
    constructor(opts) {
        this.cosign = (opts === null || opts === void 0 ? void 0 : opts.cosign) || new cosign_1.Cosign();
        this.imageTools = (opts === null || opts === void 0 ? void 0 : opts.imageTools) || new imagetools_1.ImageTools();
    }
    signAttestationManifests(opts) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!(yield this.cosign.isAvailable())) {
                throw new Error('Cosign is required to sign attestation manifests');
            }
            const result = {};
            try {
                if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
                    throw new Error('missing "id-token" permission. Please add "permissions: id-token: write" to your workflow.');
                }
                const endpoints = this.signingEndpoints(opts.noTransparencyLog);
                core.info(`Using Sigstore signing endpoint: ${endpoints.fulcioURL}`);
                const noTransparencyLog = Sigstore.noTransparencyLog(opts.noTransparencyLog);
                for (const imageName of opts.imageNames) {
                    const attestationDigests = yield this.imageTools.attestationDigests(`${imageName}@${opts.imageDigest}`);
                    for (const attestationDigest of attestationDigests) {
                        const attestationRef = `${imageName}@${attestationDigest}`;
                        yield core.group(`Signing attestation manifest ${attestationRef}`, () => __awaiter(this, void 0, void 0, function* () {
                            // prettier-ignore
                            const cosignArgs = [
                                '--verbose',
                                'sign',
                                '--yes',
                                '--oidc-provider', 'github-actions',
                                '--registry-referrers-mode', 'oci-1-1',
                                '--new-bundle-format',
                                '--use-signing-config'
                            ];
                            if (noTransparencyLog) {
                                cosignArgs.push('--tlog-upload=false');
                            }
                            core.info(`[command]cosign ${[...cosignArgs, attestationRef].join(' ')}`);
                            const execRes = yield exec_1.Exec.getExecOutput('cosign', [...cosignArgs, attestationRef], {
                                ignoreReturnCode: true,
                                silent: true,
                                env: Object.assign({}, process.env, {
                                    COSIGN_EXPERIMENTAL: '1'
                                })
                            });
                            const signResult = cosign_1.Cosign.parseCommandOutput(execRes.stderr.trim());
                            if (execRes.exitCode != 0) {
                                if (signResult.errors && signResult.errors.length > 0) {
                                    const errorMessages = signResult.errors.map(e => `- [${e.code}] ${e.message} : ${e.detail}`).join('\n');
                                    throw new Error(`Cosign sign command failed with errors:\n${errorMessages}`);
                                }
                                else {
                                    throw new Error(`Cosign sign command failed with exit code ${execRes.exitCode}`);
                                }
                            }
                            const parsedBundle = Sigstore.parseBundle((0, bundle_1.bundleFromJSON)(signResult.bundle));
                            if (parsedBundle.tlogID) {
                                core.info(`Uploaded to Rekor transparency log: ${sigstore_1.SEARCH_URL}?logIndex=${parsedBundle.tlogID}`);
                            }
                            core.info(`Signature manifest pushed: https://oci.dag.dev/?referrers=${attestationRef}`);
                            result[attestationRef] = Object.assign(Object.assign({}, parsedBundle), { imageName: imageName });
                        }));
                    }
                }
            }
            catch (err) {
                throw new Error(`Signing BuildKit attestation manifests failed: ${err.message}`);
            }
            return result;
        });
    }
    verifySignedManifests(opts, signed) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const result = {};
            const retries = (_a = opts.retries) !== null && _a !== void 0 ? _a : 15;
            if (!(yield this.cosign.isAvailable())) {
                throw new Error('Cosign is required to verify signed manifests');
            }
            let lastError;
            for (const [attestationRef, signedRes] of Object.entries(signed)) {
                yield core.group(`Verifying signature of ${attestationRef}`, () => __awaiter(this, void 0, void 0, function* () {
                    // prettier-ignore
                    const cosignArgs = [
                        '--verbose',
                        'verify',
                        '--experimental-oci11',
                        '--new-bundle-format',
                        '--certificate-oidc-issuer', 'https://token.actions.githubusercontent.com',
                        '--certificate-identity-regexp', opts.certificateIdentityRegexp
                    ];
                    if (!signedRes.tlogID) {
                        // skip tlog verification but still verify the signed timestamp
                        cosignArgs.push('--use-signed-timestamps', '--insecure-ignore-tlog');
                    }
                    core.info(`[command]cosign ${[...cosignArgs, attestationRef].join(' ')}`);
                    for (let attempt = 0; attempt < retries; attempt++) {
                        const execRes = yield exec_1.Exec.getExecOutput('cosign', [...cosignArgs, attestationRef], {
                            ignoreReturnCode: true,
                            silent: true,
                            env: Object.assign({}, process.env, {
                                COSIGN_EXPERIMENTAL: '1'
                            })
                        });
                        const verifyResult = cosign_1.Cosign.parseCommandOutput(execRes.stderr.trim());
                        if (execRes.exitCode === 0) {
                            result[attestationRef] = {
                                cosignArgs: cosignArgs,
                                signatureManifestDigest: verifyResult.signatureManifestDigest
                            };
                            lastError = undefined;
                            core.info(`Signature manifest verified: https://oci.dag.dev/?image=${signedRes.imageName}@${verifyResult.signatureManifestDigest}`);
                            break;
                        }
                        else {
                            if (verifyResult.errors && verifyResult.errors.length > 0) {
                                const errorMessages = verifyResult.errors.map(e => `- [${e.code}] ${e.message} : ${e.detail}`).join('\n');
                                lastError = new Error(`Cosign verify command failed with errors:\n${errorMessages}`);
                                if (verifyResult.errors.some(e => e.code === 'MANIFEST_UNKNOWN')) {
                                    core.info(`Cosign verify command failed with MANIFEST_UNKNOWN, retrying attempt ${attempt + 1}/${retries}...\n${errorMessages}`);
                                    yield new Promise(res => setTimeout(res, Math.pow(2, attempt) * 100));
                                }
                                else {
                                    throw lastError;
                                }
                            }
                            else {
                                throw new Error(`Cosign verify command failed: ${execRes.stderr}`);
                            }
                        }
                    }
                }));
            }
            if (lastError) {
                throw lastError;
            }
            return result;
        });
    }
    signProvenanceBlobs(opts) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = {};
            try {
                if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
                    throw new Error('missing "id-token" permission. Please add "permissions: id-token: write" to your workflow.');
                }
                const endpoints = this.signingEndpoints(opts.noTransparencyLog);
                core.info(`Using Sigstore signing endpoint: ${endpoints.fulcioURL}`);
                const provenanceBlobs = Sigstore.getProvenanceBlobs(opts);
                for (const p of Object.keys(provenanceBlobs)) {
                    yield core.group(`Signing ${p}`, () => __awaiter(this, void 0, void 0, function* () {
                        var _a;
                        const blob = provenanceBlobs[p];
                        const bundlePath = path_1.default.join(path_1.default.dirname(p), `${(_a = opts.name) !== null && _a !== void 0 ? _a : 'provenance'}.sigstore.json`);
                        const subjects = Sigstore.getProvenanceSubjects(blob);
                        if (subjects.length === 0) {
                            core.warning(`No subjects found in provenance ${p}, skip signing.`);
                            return;
                        }
                        const bundle = yield Sigstore.signPayload({
                            data: blob,
                            type: intoto_1.MEDIATYPE_PAYLOAD
                        }, endpoints);
                        const parsedBundle = Sigstore.parseBundle(bundle);
                        core.info(`Provenance blob signed for:`);
                        for (const subject of subjects) {
                            const [digestAlg, digestValue] = Object.entries(subject.digest)[0] || [];
                            core.info(`  - ${subject.name} (${digestAlg}:${digestValue})`);
                        }
                        if (parsedBundle.tlogID) {
                            core.info(`Attestation signature uploaded to Rekor transparency log: ${sigstore_1.SEARCH_URL}?logIndex=${parsedBundle.tlogID}`);
                        }
                        core.info(`Writing Sigstore bundle to: ${bundlePath}`);
                        fs_1.default.writeFileSync(bundlePath, JSON.stringify(parsedBundle.payload, null, 2), {
                            encoding: 'utf-8'
                        });
                        result[p] = Object.assign(Object.assign({}, parsedBundle), { bundlePath: bundlePath, subjects: subjects });
                    }));
                }
            }
            catch (err) {
                throw new Error(`Signing BuildKit provenance blobs failed: ${err.message}`);
            }
            return result;
        });
    }
    verifySignedArtifacts(opts, signed) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = {};
            if (!(yield this.cosign.isAvailable())) {
                throw new Error('Cosign is required to verify signed artifacts');
            }
            for (const [provenancePath, signedRes] of Object.entries(signed)) {
                const baseDir = path_1.default.dirname(provenancePath);
                yield core.group(`Verifying signature bundle ${signedRes.bundlePath}`, () => __awaiter(this, void 0, void 0, function* () {
                    for (const subject of signedRes.subjects) {
                        const artifactPath = path_1.default.join(baseDir, subject.name);
                        core.info(`Verifying signed artifact ${artifactPath}`);
                        // prettier-ignore
                        const cosignArgs = [
                            'verify-blob-attestation',
                            '--new-bundle-format',
                            '--certificate-oidc-issuer', 'https://token.actions.githubusercontent.com',
                            '--certificate-identity-regexp', opts.certificateIdentityRegexp
                        ];
                        if (!signedRes.tlogID) {
                            // if there is no tlog entry, we skip tlog verification but still verify the signed timestamp
                            cosignArgs.push('--use-signed-timestamps', '--insecure-ignore-tlog');
                        }
                        const execRes = yield exec_1.Exec.getExecOutput('cosign', [...cosignArgs, '--bundle', signedRes.bundlePath, artifactPath], {
                            ignoreReturnCode: true
                        });
                        if (execRes.stderr.length > 0 && execRes.exitCode != 0) {
                            throw new Error(execRes.stderr);
                        }
                        result[artifactPath] = {
                            bundlePath: signedRes.bundlePath,
                            cosignArgs: cosignArgs
                        };
                    }
                }));
            }
            return result;
        });
    }
    signingEndpoints(noTransparencyLog) {
        noTransparencyLog = Sigstore.noTransparencyLog(noTransparencyLog);
        core.info(`Upload to transparency log: ${noTransparencyLog ? 'disabled' : 'enabled'}`);
        return {
            fulcioURL: sigstore_1.FULCIO_URL,
            rekorURL: noTransparencyLog ? undefined : sigstore_1.REKOR_URL,
            tsaServerURL: sigstore_1.TSASERVER_URL
        };
    }
    static noTransparencyLog(noTransparencyLog) {
        var _a;
        return noTransparencyLog !== null && noTransparencyLog !== void 0 ? noTransparencyLog : (_a = github_1.GitHub.context.payload.repository) === null || _a === void 0 ? void 0 : _a.private;
    }
    static getProvenanceBlobs(opts) {
        // For single platform build
        const singleProvenance = path_1.default.join(opts.localExportDir, 'provenance.json');
        if (fs_1.default.existsSync(singleProvenance)) {
            return { [singleProvenance]: fs_1.default.readFileSync(singleProvenance) };
        }
        // For multi-platform build
        const dirents = fs_1.default.readdirSync(opts.localExportDir, { withFileTypes: true });
        const platformFolders = dirents.filter(dirent => dirent.isDirectory());
        if (platformFolders.length > 0 && platformFolders.length === dirents.length && platformFolders.every(platformFolder => fs_1.default.existsSync(path_1.default.join(opts.localExportDir, platformFolder.name, 'provenance.json')))) {
            const result = {};
            for (const platformFolder of platformFolders) {
                const p = path_1.default.join(opts.localExportDir, platformFolder.name, 'provenance.json');
                result[p] = fs_1.default.readFileSync(p);
            }
            return result;
        }
        throw new Error(`No valid provenance.json found in ${opts.localExportDir}`);
    }
    static getProvenanceSubjects(body) {
        const statement = JSON.parse(body.toString());
        return statement.subject.map(s => ({
            name: s.name,
            digest: s.digest
        }));
    }
    static signPayload(artifact, endpoints, timeout, retries) {
        return __awaiter(this, void 0, void 0, function* () {
            const witnesses = [];
            const signer = new sign_1.FulcioSigner({
                identityProvider: new sign_1.CIContextProvider('sigstore'),
                fulcioBaseURL: endpoints.fulcioURL,
                timeout: timeout,
                retry: retries
            });
            if (endpoints.rekorURL) {
                witnesses.push(new sign_1.RekorWitness({
                    rekorBaseURL: endpoints.rekorURL,
                    fetchOnConflict: true,
                    timeout: timeout,
                    retry: retries
                }));
            }
            if (endpoints.tsaServerURL) {
                witnesses.push(new sign_1.TSAWitness({
                    tsaBaseURL: endpoints.tsaServerURL,
                    timeout: timeout,
                    retry: retries
                }));
            }
            return new sign_1.DSSEBundleBuilder({ signer, witnesses }).create(artifact);
        });
    }
    static parseBundle(bundle) {
        let certBytes;
        switch (bundle.verificationMaterial.content.$case) {
            case 'x509CertificateChain':
                certBytes = bundle.verificationMaterial.content.x509CertificateChain.certificates[0].rawBytes;
                break;
            case 'certificate':
                certBytes = bundle.verificationMaterial.content.certificate.rawBytes;
                break;
            default:
                throw new Error('Bundle must contain an x509 certificate');
        }
        const signingCert = new crypto_1.X509Certificate(certBytes);
        // collect transparency log ID if available
        const tlogEntries = bundle.verificationMaterial.tlogEntries;
        const tlogID = tlogEntries.length > 0 ? tlogEntries[0].logIndex : undefined;
        return {
            payload: (0, bundle_1.bundleToJSON)(bundle),
            certificate: signingCert.toString(),
            tlogID: tlogID
        };
    }
}
exports.Sigstore = Sigstore;
//# sourceMappingURL=sigstore.js.map