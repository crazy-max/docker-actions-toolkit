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
import { Manifest } from './types/oci/manifest';
export declare class HubRepository {
    private repo;
    private token;
    private static readonly http;
    private constructor();
    static build(repository: string): Promise<HubRepository>;
    getPlatformManifest(tagOrDigest: string, os?: string): Promise<Manifest>;
    extractImage(tag: string, destDir?: string): Promise<string>;
    private static getToken;
    private blobUrl;
    getManifest<T>(tagOrDigest: string): Promise<T>;
    getJSONBlob<T>(tagOrDigest: string): Promise<T>;
    private registryGet;
    private static getPlatformManifestDigest;
}
