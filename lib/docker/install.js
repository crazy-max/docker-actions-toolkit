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
exports.Install = void 0;
const child_process = __importStar(require("child_process"));
const fs_1 = __importDefault(require("fs"));
const promises_1 = __importDefault(require("fs/promises"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const async_retry_1 = __importDefault(require("async-retry"));
const handlebars = __importStar(require("handlebars"));
const core = __importStar(require("@actions/core"));
const httpm = __importStar(require("@actions/http-client"));
const io = __importStar(require("@actions/io"));
const tc = __importStar(require("@actions/tool-cache"));
const context_1 = require("../context");
const docker_1 = require("./docker");
const exec_1 = require("../exec");
const util_1 = require("../util");
const assets_1 = require("./assets");
const hubRepository_1 = require("../hubRepository");
class Install {
    constructor(opts) {
        this.limaInstanceName = 'docker-actions-toolkit';
        this.runDir = opts.runDir;
        this.source = opts.source || {
            type: 'archive',
            version: 'latest',
            channel: 'stable'
        };
        this.contextName = opts.contextName || 'setup-docker-action';
        this.daemonConfig = opts.daemonConfig;
        this.rootless = opts.rootless || false;
        this.localTCPPort = opts.localTCPPort;
    }
    get toolDir() {
        return this._toolDir || context_1.Context.tmpDir();
    }
    downloadStaticArchive(component, src) {
        return __awaiter(this, void 0, void 0, function* () {
            const release = yield Install.getRelease(src.version);
            this._version = release.tag_name.replace(/^v+|v+$/g, '');
            core.debug(`docker.Install.download version: ${this._version}`);
            const downloadURL = this.downloadURL(component, this._version, src.channel);
            core.info(`Downloading ${downloadURL}`);
            const downloadPath = yield tc.downloadTool(downloadURL);
            core.debug(`docker.Install.download downloadPath: ${downloadPath}`);
            let extractFolder;
            if (os_1.default.platform() == 'win32') {
                extractFolder = yield tc.extractZip(downloadPath, extractFolder);
            }
            else {
                extractFolder = yield tc.extractTar(downloadPath, extractFolder);
            }
            if (util_1.Util.isDirectory(path_1.default.join(extractFolder, component))) {
                extractFolder = path_1.default.join(extractFolder, component);
            }
            core.debug(`docker.Install.download extractFolder: ${extractFolder}`);
            return extractFolder;
        });
    }
    download() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            let extractFolder;
            let cacheKey;
            const platform = os_1.default.platform();
            switch (this.source.type) {
                case 'image': {
                    const tag = this.source.tag;
                    this._version = tag;
                    cacheKey = `docker-image`;
                    core.info(`Downloading docker cli from dockereng/cli-bin:${tag}`);
                    const cli = yield hubRepository_1.HubRepository.build('dockereng/cli-bin');
                    extractFolder = yield cli.extractImage(tag);
                    const moby = yield hubRepository_1.HubRepository.build('moby/moby-bin');
                    if (['win32', 'linux'].includes(platform)) {
                        core.info(`Downloading dockerd from moby/moby-bin:${tag}`);
                        yield moby.extractImage(tag, extractFolder);
                    }
                    else if (platform == 'darwin') {
                        // On macOS, the docker daemon binary will be downloaded inside the lima VM.
                        // However, we will get the exact git revision from the image config
                        // to get the matching systemd unit files.
                        core.info(`Getting git revision from moby/moby-bin:${tag}`);
                        // There's no macOS image for moby/moby-bin - a linux daemon is run inside lima.
                        const manifest = yield moby.getPlatformManifest(tag, 'linux');
                        const config = yield moby.getJSONBlob(manifest.config.digest);
                        core.debug(`Config ${JSON.stringify(config.config)}`);
                        this.gitCommit = (_b = (_a = config.config) === null || _a === void 0 ? void 0 : _a.Labels) === null || _b === void 0 ? void 0 : _b['org.opencontainers.image.revision'];
                        if (!this.gitCommit) {
                            core.warning(`No git revision can be determined from the image. Will use master.`);
                            this.gitCommit = 'master';
                        }
                        core.info(`Git revision is ${this.gitCommit}`);
                    }
                    else {
                        core.warning(`dockerd not supported on ${platform}, only the Docker cli will be available`);
                    }
                    break;
                }
                case 'archive': {
                    const version = this.source.version;
                    const channel = this.source.channel;
                    cacheKey = `docker-archive-${channel}`;
                    this._version = version;
                    core.info(`Downloading Docker ${version} from ${this.source.channel} at download.docker.com`);
                    extractFolder = yield this.downloadStaticArchive('docker', this.source);
                    if (this.rootless) {
                        core.info(`Downloading Docker rootless extras ${version} from ${this.source.channel} at download.docker.com`);
                        const extrasFolder = yield this.downloadStaticArchive('docker-rootless-extras', this.source);
                        fs_1.default.readdirSync(extrasFolder).forEach(file => {
                            const src = path_1.default.join(extrasFolder, file);
                            const dest = path_1.default.join(extractFolder, file);
                            fs_1.default.copyFileSync(src, dest);
                        });
                    }
                    break;
                }
            }
            core.info('Fixing perms');
            fs_1.default.readdir(path_1.default.join(extractFolder), function (err, files) {
                if (err) {
                    throw err;
                }
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                files.forEach(function (file, index) {
                    fs_1.default.chmodSync(path_1.default.join(extractFolder, file), '0755');
                });
            });
            const tooldir = yield tc.cacheDir(extractFolder, cacheKey, this._version.replace(/(0+)([1-9]+)/, '$2'));
            core.addPath(tooldir);
            core.info('Added Docker to PATH');
            this._toolDir = tooldir;
            return tooldir;
        });
    }
    install() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.toolDir) {
                throw new Error('toolDir must be set. Run download first.');
            }
            if (!this.runDir) {
                throw new Error('runDir must be set');
            }
            const platform = os_1.default.platform();
            if (this.rootless && platform != 'linux') {
                // TODO: Support on macOS (via lima)
                throw new Error(`rootless is only supported on linux`);
            }
            switch (platform) {
                case 'darwin': {
                    return yield this.installDarwin();
                }
                case 'linux': {
                    return yield this.installLinux();
                }
                case 'win32': {
                    return yield this.installWindows();
                }
                default: {
                    throw new Error(`Unsupported platform: ${os_1.default.platform()}`);
                }
            }
        });
    }
    installDarwin() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.source.type == 'image' && !this.gitCommit) {
                throw new Error('gitCommit must be set. Run download first.');
            }
            const src = this.source;
            const limaDir = path_1.default.join(os_1.default.homedir(), '.lima', this.limaInstanceName);
            yield io.mkdirP(limaDir);
            const dockerHost = `unix://${limaDir}/docker.sock`;
            // avoid brew to auto update and upgrade unrelated packages.
            let envs = Object.assign({}, process.env, {
                HOMEBREW_NO_AUTO_UPDATE: '1',
                HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK: '1'
            });
            if (!(yield Install.limaInstalled())) {
                yield core.group('Installing lima', () => __awaiter(this, void 0, void 0, function* () {
                    yield exec_1.Exec.exec('brew', ['install', 'lima'], { env: envs });
                }));
            }
            yield core.group('Lima version', () => __awaiter(this, void 0, void 0, function* () {
                yield exec_1.Exec.exec('lima', ['--version'], { env: envs });
            }));
            yield core.group('Creating lima config', () => __awaiter(this, void 0, void 0, function* () {
                let limaDaemonConfig = {};
                if (this.daemonConfig) {
                    limaDaemonConfig = JSON.parse(this.daemonConfig);
                }
                handlebars.registerHelper('stringify', function (obj) {
                    return new handlebars.SafeString(JSON.stringify(obj));
                });
                const srcArchive = src;
                const limaCfg = handlebars.compile(assets_1.limaYamlData)({
                    customImages: Install.limaCustomImages(),
                    daemonConfig: limaDaemonConfig,
                    dockerSock: `${limaDir}/docker.sock`,
                    localTCPPort: this.localTCPPort,
                    gitCommit: this.gitCommit,
                    srcType: src.type,
                    srcArchiveVersion: this._version, // Use the resolved version (e.g. latest -> 27.4.0)
                    srcArchiveChannel: srcArchive.channel,
                    srcImageTag: src.tag
                });
                core.info(`Writing lima config to ${path_1.default.join(limaDir, 'lima.yaml')}`);
                fs_1.default.writeFileSync(path_1.default.join(limaDir, 'lima.yaml'), limaCfg);
                core.info(limaCfg);
            }));
            if (!(yield Install.qemuInstalled())) {
                yield core.group('Installing QEMU', () => __awaiter(this, void 0, void 0, function* () {
                    yield exec_1.Exec.exec('brew', ['install', 'qemu'], { env: envs });
                }));
            }
            const qemuBin = yield Install.qemuBin();
            yield core.group('QEMU version', () => __awaiter(this, void 0, void 0, function* () {
                yield exec_1.Exec.exec(qemuBin, ['--version']);
            }));
            // lima might already be started on the runner so env var added in download
            // method is not expanded to the running process.
            envs = Object.assign({}, envs, {
                PATH: `${this.toolDir}:${process.env.PATH}`
            });
            yield core.group('Starting lima instance', () => __awaiter(this, void 0, void 0, function* () {
                const limaStartArgs = ['start', `--name=${this.limaInstanceName}`];
                if (process.env.LIMA_START_ARGS) {
                    limaStartArgs.push(process.env.LIMA_START_ARGS);
                }
                try {
                    yield exec_1.Exec.exec(`limactl ${limaStartArgs.join(' ')}`, [], { env: envs });
                }
                catch (e) {
                    promises_1.default
                        .readdir(limaDir)
                        .then(files => {
                        files
                            .filter(f => path_1.default.extname(f) === '.log')
                            .forEach(f => {
                            const logfile = path_1.default.join(limaDir, f);
                            const logcontent = fs_1.default.readFileSync(logfile, { encoding: 'utf8' }).trim();
                            if (logcontent.length > 0) {
                                core.info(`### ${logfile}:\n${logcontent}`);
                            }
                        });
                    })
                        .catch(() => {
                        // ignore
                    });
                    throw e;
                }
            }));
            yield core.group('Create Docker context', () => __awaiter(this, void 0, void 0, function* () {
                yield docker_1.Docker.exec(['context', 'create', this.contextName, '--docker', `host=${dockerHost}`]);
                yield docker_1.Docker.exec(['context', 'use', this.contextName]);
            }));
            return dockerHost;
        });
    }
    installLinux() {
        return __awaiter(this, void 0, void 0, function* () {
            const dockerHost = `unix://${path_1.default.join(this.runDir, 'docker.sock')}`;
            yield io.mkdirP(this.runDir);
            const daemonConfigPath = path_1.default.join(this.runDir, 'daemon.json');
            yield fs_1.default.writeFileSync(daemonConfigPath, '{}');
            let daemonConfig = undefined;
            const daemonConfigDefaultPath = '/etc/docker/daemon.json';
            if (fs_1.default.existsSync(daemonConfigDefaultPath)) {
                yield core.group('Default Docker daemon config found', () => __awaiter(this, void 0, void 0, function* () {
                    core.info(JSON.stringify(JSON.parse(fs_1.default.readFileSync(daemonConfigDefaultPath, { encoding: 'utf8' })), null, 2));
                }));
                daemonConfig = JSON.parse(fs_1.default.readFileSync(daemonConfigDefaultPath, { encoding: 'utf8' }));
            }
            if (this.daemonConfig) {
                daemonConfig = Object.assign(daemonConfig || {}, JSON.parse(this.daemonConfig));
            }
            if (daemonConfig) {
                const daemonConfigStr = JSON.stringify(daemonConfig, null, 2);
                yield core.group('Writing Docker daemon config', () => __awaiter(this, void 0, void 0, function* () {
                    fs_1.default.writeFileSync(daemonConfigPath, daemonConfigStr);
                    core.info(daemonConfigStr);
                }));
            }
            const envs = Object.assign({}, process.env, {
                PATH: `${this.toolDir}:${process.env.PATH}`,
                XDG_RUNTIME_DIR: (this.rootless && this.runDir) || undefined
            });
            yield core.group('Start Docker daemon', () => __awaiter(this, void 0, void 0, function* () {
                const bashPath = yield io.which('bash', true);
                let dockerPath = `${this.toolDir}/dockerd`;
                if (this.rootless) {
                    dockerPath = `${this.toolDir}/dockerd-rootless.sh`;
                    if (fs_1.default.existsSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns')) {
                        yield exec_1.Exec.exec('sudo', ['sh', '-c', 'echo 0 > /proc/sys/kernel/apparmor_restrict_unprivileged_userns']);
                    }
                }
                let cmd = `${dockerPath} --host="${dockerHost}" --config-file="${daemonConfigPath}" --exec-root="${this.runDir}/execroot" --data-root="${this.runDir}/data" --pidfile="${this.runDir}/docker.pid"`;
                if (this.localTCPPort) {
                    cmd += ` --host="tcp://127.0.0.1:${this.localTCPPort}"`;
                }
                core.info(`[command] ${cmd}`); // https://github.com/actions/toolkit/blob/3d652d3133965f63309e4b2e1c8852cdbdcb3833/packages/exec/src/toolrunner.ts#L47
                let sudo = 'sudo';
                if (this.rootless) {
                    sudo += ' -u \\#1001';
                }
                const proc = yield child_process.spawn(
                // We can't use Exec.exec here because we need to detach the process to
                // avoid killing it when the action finishes running. Even if detached,
                // we also need to run dockerd in a subshell and unref the process so
                // GitHub Action doesn't wait for it to finish.
                `${sudo} env "PATH=$PATH" ${bashPath} << EOF
( ${cmd} 2>&1 | tee "${this.runDir}/dockerd.log" ) &
EOF`, [], {
                    env: envs,
                    detached: true,
                    shell: true,
                    stdio: ['ignore', process.stdout, process.stderr]
                });
                proc.unref();
                yield util_1.Util.sleep(3);
                const retries = 10;
                yield (0, async_retry_1.default)((bail) => __awaiter(this, void 0, void 0, function* () {
                    try {
                        yield exec_1.Exec.getExecOutput(`docker version`, undefined, {
                            silent: true,
                            env: Object.assign({}, envs, {
                                DOCKER_HOST: dockerHost,
                                DOCKER_CONTENT_TRUST: 'false'
                            })
                        });
                    }
                    catch (e) {
                        bail(e);
                    }
                }), {
                    retries: retries,
                    minTimeout: 1000,
                    onRetry: (err, i) => {
                        core.info(`${err}. Retrying (${i}/${retries})...`);
                    }
                });
                core.info(`Docker daemon started started successfully`);
            }));
            yield core.group('Create Docker context', () => __awaiter(this, void 0, void 0, function* () {
                yield docker_1.Docker.exec(['context', 'create', this.contextName, '--docker', `host=${dockerHost}`]);
                yield docker_1.Docker.exec(['context', 'use', this.contextName]);
            }));
            return dockerHost;
        });
    }
    installWindows() {
        return __awaiter(this, void 0, void 0, function* () {
            const dockerHostSocket = 'npipe:////./pipe/setup_docker_action';
            let daemonConfig = undefined;
            const daemonConfigPath = path_1.default.join(this.runDir, 'daemon.json');
            if (fs_1.default.existsSync(daemonConfigPath)) {
                yield core.group('Default Docker daemon config found', () => __awaiter(this, void 0, void 0, function* () {
                    core.info(JSON.stringify(JSON.parse(fs_1.default.readFileSync(daemonConfigPath, { encoding: 'utf8' })), null, 2));
                }));
                daemonConfig = JSON.parse(fs_1.default.readFileSync(daemonConfigPath, { encoding: 'utf8' }));
            }
            if (this.daemonConfig) {
                daemonConfig = Object.assign(daemonConfig || {}, JSON.parse(this.daemonConfig));
            }
            let daemonConfigStr = '{}';
            if (daemonConfig) {
                daemonConfigStr = JSON.stringify(daemonConfig, null, 2);
                yield core.group('Docker daemon config', () => __awaiter(this, void 0, void 0, function* () {
                    core.info(daemonConfigStr);
                }));
            }
            const params = {
                ToolDir: this.toolDir,
                RunDir: this.runDir,
                DockerHostSocket: dockerHostSocket,
                DaemonConfig: daemonConfigStr
            };
            if (this.localTCPPort) {
                params['DockerHostTCP'] = `tcp://127.0.0.1:${this.localTCPPort}`;
            }
            yield core.group('Install Docker daemon service', () => __awaiter(this, void 0, void 0, function* () {
                const setupCmd = yield util_1.Util.powershellCommand((0, assets_1.setupDockerWinPs1)(), params);
                yield exec_1.Exec.exec(setupCmd.command, setupCmd.args);
                const logCmd = yield util_1.Util.powershellCommand((0, assets_1.dockerServiceLogsPs1)());
                yield exec_1.Exec.exec(logCmd.command, logCmd.args);
            }));
            yield core.group('Create Docker context', () => __awaiter(this, void 0, void 0, function* () {
                yield docker_1.Docker.exec(['context', 'create', this.contextName, '--docker', `host=${dockerHostSocket}`]);
                yield docker_1.Docker.exec(['context', 'use', this.contextName]);
            }));
            return dockerHostSocket;
        });
    }
    tearDown() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.runDir) {
                throw new Error('runDir must be set');
            }
            switch (os_1.default.platform()) {
                case 'darwin': {
                    yield this.tearDownDarwin();
                    break;
                }
                case 'linux': {
                    yield this.tearDownLinux();
                    break;
                }
                case 'win32': {
                    yield this.tearDownWindows();
                    break;
                }
                default: {
                    throw new Error(`Unsupported platform: ${os_1.default.platform()}`);
                }
            }
            yield core.group(`Cleaning up toolDir`, () => __awaiter(this, void 0, void 0, function* () {
                if (!this._toolDir) {
                    return;
                }
                fs_1.default.rmSync(this._toolDir, { recursive: true, force: true });
            }));
        });
    }
    tearDownDarwin() {
        return __awaiter(this, void 0, void 0, function* () {
            yield core.group('Docker daemon logs', () => __awaiter(this, void 0, void 0, function* () {
                yield exec_1.Exec.exec('limactl', ['shell', '--tty=false', this.limaInstanceName, 'sudo', 'journalctl', '-u', 'docker.service', '-l', '--no-pager']).catch(() => {
                    core.warning(`Failed to get Docker daemon logs`);
                });
            }));
            yield core.group('Stopping lima instance', () => __awaiter(this, void 0, void 0, function* () {
                yield exec_1.Exec.exec('limactl', ['stop', '--tty=false', this.limaInstanceName, '--force']);
            }));
            yield core.group('Removing lima instance', () => __awaiter(this, void 0, void 0, function* () {
                yield exec_1.Exec.exec('limactl', ['delete', '--tty=false', this.limaInstanceName, '--force']);
            }));
            yield core.group('Removing Docker context', () => __awaiter(this, void 0, void 0, function* () {
                yield docker_1.Docker.exec(['context', 'rm', '-f', this.contextName]);
            }));
            yield core.group(`Cleaning up runDir`, () => __awaiter(this, void 0, void 0, function* () {
                yield exec_1.Exec.exec('sudo', ['rm', '-rf', this.runDir]);
            }));
        });
    }
    tearDownLinux() {
        return __awaiter(this, void 0, void 0, function* () {
            yield core.group('Docker daemon logs', () => __awaiter(this, void 0, void 0, function* () {
                core.info(fs_1.default.readFileSync(path_1.default.join(this.runDir, 'dockerd.log'), { encoding: 'utf8' }));
            }));
            yield core.group('Stopping Docker daemon', () => __awaiter(this, void 0, void 0, function* () {
                yield exec_1.Exec.exec('sudo', ['kill', '-s', 'SIGTERM', fs_1.default.readFileSync(path_1.default.join(this.runDir, 'docker.pid')).toString().trim()]);
                yield util_1.Util.sleep(5);
            }));
            yield core.group('Removing Docker context', () => __awaiter(this, void 0, void 0, function* () {
                yield docker_1.Docker.exec(['context', 'rm', '-f', this.contextName]);
            }));
            yield core.group(`Cleaning up runDir`, () => __awaiter(this, void 0, void 0, function* () {
                yield exec_1.Exec.exec('sudo', ['rm', '-rf', this.runDir], {
                    ignoreReturnCode: true,
                    failOnStdErr: false
                });
            }));
        });
    }
    tearDownWindows() {
        return __awaiter(this, void 0, void 0, function* () {
            yield core.group('Docker daemon logs', () => __awaiter(this, void 0, void 0, function* () {
                const logCmd = yield util_1.Util.powershellCommand((0, assets_1.dockerServiceLogsPs1)());
                yield exec_1.Exec.exec(logCmd.command, logCmd.args);
            }));
            yield core.group('Removing Docker context', () => __awaiter(this, void 0, void 0, function* () {
                yield docker_1.Docker.exec(['context', 'rm', '-f', this.contextName]);
            }));
            yield core.group('Stopping Docker daemon service', () => __awaiter(this, void 0, void 0, function* () {
                yield exec_1.Exec.exec('powershell', ['-Command', `Stop-Service -Name docker -Force`]);
            }));
        });
    }
    downloadURL(component, version, channel) {
        const platformOS = Install.platformOS();
        const platformArch = Install.platformArch();
        const ext = platformOS === 'win' ? '.zip' : '.tgz';
        return `https://download.docker.com/${platformOS}/static/${channel}/${platformArch}/${component}-${version}${ext}`;
    }
    static platformOS() {
        switch (os_1.default.platform()) {
            case 'darwin': {
                return 'mac';
            }
            case 'linux': {
                return 'linux';
            }
            case 'win32': {
                return 'win';
            }
            default: {
                return os_1.default.platform();
            }
        }
    }
    static platformArch() {
        switch (os_1.default.arch()) {
            case 'x64': {
                return 'x86_64';
            }
            case 'ppc64': {
                return 'ppc64le';
            }
            case 'arm64': {
                return 'aarch64';
            }
            case 'arm': {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const arm_version = process.config.variables.arm_version;
                switch (arm_version) {
                    case 6: {
                        return 'armel';
                    }
                    case 7: {
                        return 'armhf';
                    }
                    default: {
                        return `v${arm_version}`;
                    }
                }
            }
            default: {
                return os_1.default.arch();
            }
        }
    }
    static limaInstalled() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield io
                .which('lima', true)
                .then(res => {
                core.debug(`docker.Install.limaInstalled ok: ${res}`);
                return true;
            })
                .catch(error => {
                core.debug(`docker.Install.limaInstalled error: ${error}`);
                return false;
            });
        });
    }
    static qemuBin() {
        return __awaiter(this, void 0, void 0, function* () {
            switch (os_1.default.arch()) {
                case 'x64': {
                    return `qemu-system-x86_64`;
                }
                case 'arm64': {
                    return `qemu-system-aarch64`;
                }
                default: {
                    return `qemu-system-${os_1.default.arch()}`;
                }
            }
        });
    }
    static qemuInstalled() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield io
                .which(yield Install.qemuBin(), true)
                .then(res => {
                core.debug(`docker.Install.qemuInstalled ok: ${res}`);
                return true;
            })
                .catch(error => {
                core.debug(`docker.Install.qemuInstalled error: ${error}`);
                return false;
            });
        });
    }
    static getRelease(version) {
        return __awaiter(this, void 0, void 0, function* () {
            const url = `https://raw.githubusercontent.com/docker/actions-toolkit/main/.github/docker-releases.json`;
            const http = new httpm.HttpClient('docker-actions-toolkit');
            const resp = yield http.get(url);
            const body = yield resp.readBody();
            const statusCode = resp.message.statusCode || 500;
            if (statusCode >= 400) {
                throw new Error(`Failed to get Docker release ${version} from ${url} with status code ${statusCode}: ${body}`);
            }
            const releases = JSON.parse(body);
            if (!releases[version]) {
                if (!releases['v' + version]) {
                    throw new Error(`Cannot find Docker release ${version} in ${url}`);
                }
                return releases['v' + version];
            }
            return releases[version];
        });
    }
    static limaCustomImages() {
        const res = [];
        const env = process.env.LIMA_IMAGES;
        if (!env) {
            return res;
        }
        for (const input of util_1.Util.getList(env, { ignoreComma: true, comment: '#' })) {
            const archIndex = input.indexOf(':');
            const arch = input.substring(0, archIndex).trim();
            const digestIndex = input.indexOf('@');
            const location = input.substring(archIndex + 1, digestIndex !== -1 ? digestIndex : undefined).trim();
            const digest = digestIndex !== -1 ? input.substring(digestIndex + 1).trim() : '';
            res.push({
                location: location,
                arch: arch,
                digest: digest
            });
        }
        return res;
    }
}
exports.Install = Install;
//# sourceMappingURL=install.js.map