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
import { Cosign } from '../cosign/cosign';
import { ImageTools } from '../buildx/imagetools';
import { SignAttestationManifestsOpts, SignAttestationManifestsResult, SignProvenanceBlobsOpts, SignProvenanceBlobsResult, VerifySignedArtifactsOpts, VerifySignedArtifactsResult, VerifySignedManifestsOpts, VerifySignedManifestsResult } from '../types/sigstore/sigstore';
export interface SigstoreOpts {
    cosign?: Cosign;
    imageTools?: ImageTools;
}
export declare class Sigstore {
    private readonly cosign;
    private readonly imageTools;
    constructor(opts?: SigstoreOpts);
    signAttestationManifests(opts: SignAttestationManifestsOpts): Promise<Record<string, SignAttestationManifestsResult>>;
    verifySignedManifests(opts: VerifySignedManifestsOpts, signed: Record<string, SignAttestationManifestsResult>): Promise<Record<string, VerifySignedManifestsResult>>;
    signProvenanceBlobs(opts: SignProvenanceBlobsOpts): Promise<Record<string, SignProvenanceBlobsResult>>;
    verifySignedArtifacts(opts: VerifySignedArtifactsOpts, signed: Record<string, SignProvenanceBlobsResult>): Promise<Record<string, VerifySignedArtifactsResult>>;
    private signingEndpoints;
    private static noTransparencyLog;
    private static getProvenanceBlobs;
    private static getProvenanceSubjects;
    private static signPayload;
    private static parseBundle;
}
