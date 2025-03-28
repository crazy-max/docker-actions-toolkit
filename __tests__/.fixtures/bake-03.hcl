// Copyright 2024 actions-toolkit authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

target "default" {
  attest = [
    "type=provenance,mode=max",
    "type=sbom,disabled=true",
  ]
  cache-from = [
    "type=gha,scope=build",
    "user/repo:cache",
  ]
  cache-to = [
    "type=gha,scope=build,mode=max",
    "type=inline"
  ]
  output = [
    "./release-out",
    "type=registry,ref=user/app"
  ]
  secret = [
    "id=GITHUB_TOKEN,env=GITHUB_TOKEN",
    "id=aws,src=__tests__/.fixtures/secret.txt",
    "id=GITHUB_REPOSITORY"
  ]
}
