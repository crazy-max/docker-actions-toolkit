# syntax=docker/dockerfile:1

# Copyright 2023 actions-toolkit authors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

ARG GO_VERSION=1.22
ARG DEBIAN_VERSION=bookworm
ARG PROTOC_VERSION=3.11.4
ARG BUILDKIT_VERSION=v0.15.1

# protoc is dynamically linked to glibc so can't use alpine base
FROM golang:${GO_VERSION}-${DEBIAN_VERSION} AS base
RUN apt-get update && apt-get --no-install-recommends install -y git tree unzip
ARG PROTOC_VERSION
ARG TARGETOS
ARG TARGETARCH
RUN <<EOT
  set -e
  arch=$(echo $TARGETARCH | sed -e s/amd64/x86_64/ -e s/arm64/aarch_64/)
  wget -q https://github.com/protocolbuffers/protobuf/releases/download/v${PROTOC_VERSION}/protoc-${PROTOC_VERSION}-${TARGETOS}-${arch}.zip
  unzip protoc-${PROTOC_VERSION}-${TARGETOS}-${arch}.zip -d /usr/local
EOT

WORKDIR /go/src/github.com/moby/buildkit
ARG BUILDKIT_VERSION
ADD "https://github.com/moby/buildkit.git#${BUILDKIT_VERSION}" .

# install tools
RUN --mount=type=cache,target=/root/.cache \
    --mount=type=cache,target=/go/pkg/mod \
    go install \
      github.com/gogo/protobuf/protoc-gen-gogo \
      github.com/gogo/protobuf/protoc-gen-gogofaster \
      github.com/gogo/protobuf/protoc-gen-gogoslick \
      github.com/golang/protobuf/protoc-gen-go

# install ts-proto
RUN apt-get install -y nodejs npm
RUN npm install ts-proto

FROM base AS generated
RUN <<EOT
  set -ex
  mkdir /out
  protoc -I=../../../ -I=. -I=./vendor/ -I=./vendor/github.com/tonistiigi/fsutil/types/ -I=./vendor/github.com/gogo/protobuf/ --plugin=./node_modules/.bin/protoc-gen-ts_proto --ts_proto_out=/out \
    ./api/services/control/control.proto \
    ./cache/contenthash/checksum.proto \
    ./frontend/gateway/pb/gateway.proto \
    ./session/auth/auth.proto \
    ./solver/errdefs/errdefs.proto \
    ./solver/pb/ops.proto
  tree /out
EOT

FROM scratch AS update
COPY --from=generated /out /
