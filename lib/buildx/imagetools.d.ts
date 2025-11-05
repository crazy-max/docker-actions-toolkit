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
import { Buildx } from './buildx';
import { Manifest as ImageToolsManifest } from '../types/buildx/imagetools';
import { Image } from '../types/oci/config';
import { Descriptor } from '../types/oci/descriptor';
import { Digest } from '../types/oci/digest';
export interface ImageToolsOpts {
    buildx?: Buildx;
}
export declare class ImageTools {
    private readonly buildx;
    constructor(opts?: ImageToolsOpts);
    getCommand(args: Array<string>): Promise<{
        command: string;
        args: string[];
    }>;
    getInspectCommand(args: Array<string>): Promise<{
        command: string;
        args: string[];
    }>;
    inspectImage(name: string): Promise<Record<string, Image> | Image>;
    inspectManifest(name: string): Promise<ImageToolsManifest | Descriptor>;
    attestationDescriptors(name: string): Promise<Array<Descriptor>>;
    attestationDigests(name: string): Promise<Array<Digest>>;
}
