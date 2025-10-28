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

import {Versioned} from '../oci/versioned';
import {Descriptor} from '../oci/descriptor';
import {Digest} from '../oci/digest';

// https://github.com/docker/buildx/blob/62857022a08552bee5cad0c3044a9a3b185f0b32/util/imagetools/printers.go#L109-L123
export interface Manifest extends Versioned {
  mediaType?: string;
  digest: Digest;
  size: number;
  manifests?: Descriptor[];
  annotations?: Record<string, string>;
}
