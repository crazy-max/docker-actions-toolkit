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
import { Buildx } from '../buildx/buildx';
import { Config } from './config';
import { BuilderInfo, NodeInfo } from '../types/buildx/builder';
export interface BuildKitOpts {
    buildx?: Buildx;
}
export declare class BuildKit {
    private readonly buildx;
    readonly config: Config;
    constructor(opts?: BuildKitOpts);
    getVersion(node: NodeInfo): Promise<string | undefined>;
    private getVersionWithinImage;
    versionSatisfies(builderName: string, range: string, builderInfo?: BuilderInfo): Promise<boolean>;
}