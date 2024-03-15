/**
 * Copyright 2024 actions-toolkit authors
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

import {describe, expect, test} from '@jest/globals';

import {Docker} from '../../src/docker/docker';

const maybe = !process.env.GITHUB_ACTIONS || (process.env.GITHUB_ACTIONS === 'true' && process.env.ImageOS && process.env.ImageOS.startsWith('ubuntu')) ? describe : describe.skip;

maybe('pull', () => {
  // prettier-ignore
  test.each([
    'busybox',
    'busybox:1.36',
    'busybox@sha256:7ae8447f3a7f5bccaa765926f25fc038e425cf1b2be6748727bbea9a13102094'
  ])(
    'pulling %s', async (image) => {
      await expect((async () => {
        await Docker.pull(image, true);
      })()).resolves.not.toThrow();
    }, 600000);
});
