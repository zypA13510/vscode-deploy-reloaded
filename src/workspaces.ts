/**
 * This file is part of the vscode-deploy-reloaded distribution.
 * Copyright (c) Marcel Joachim Kloubert.
 * 
 * vscode-deploy-reloaded is free software: you can redistribute it and/or modify  
 * it under the terms of the GNU Lesser General Public License as   
 * published by the Free Software Foundation, version 3.
 *
 * vscode-deploy-reloaded is distributed in the hope that it will be useful, but 
 * WITHOUT ANY WARRANTY; without even the implied warranty of 
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU 
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import * as deploy_contracts from './contracts';
import * as deploy_delete from './delete';
import * as deploy_deploy from './deploy';
import * as deploy_helpers from './helpers';
import * as deploy_i18 from './i18';
import * as deploy_list from './list';
import * as deploy_log from './log';
import * as deploy_packages from './packages';
import * as deploy_plugins from './plugins';
import * as deploy_pull from './pull';
import * as deploy_targets from './targets';
import * as Enumerable from 'node-enumerable';
import * as Events from 'events';
import * as Glob from 'glob';
import * as i18next from 'i18next';
const MergeDeep = require('merge-deep');
import * as Path from 'path';
import * as vscode from 'vscode';


/**
 * A workspace context.
 */
export interface WorkspaceContext {
    /**
     * The underlying extension context.
     */
    readonly extension: vscode.ExtensionContext;
    /**
     * The output channel.
     */
    readonly outputChannel: vscode.OutputChannel;
    /**
     * All plugins.
     */
    readonly plugins: deploy_plugins.Plugin[];
    /**
     * The list of other workspaces.
     */
    readonly workspaces: Workspace[];
}

/**
 * A workspace file.
 */
export interface WorkspaceFile extends deploy_contracts.WithNameAndPath, WorkspaceItem {
    /**
     * The path to the (local) file.
     */
    readonly file: string;
}

/**
 * A workspace item.
 */
export interface WorkspaceItem {
    /**
     * The underlying workspace.
     */
    readonly workspace: Workspace;
}

/**
 * A workspace item from settings.
 */
export interface WorkspaceItemFromSettings {
    /**
     * [INTERNAL] DO NOT DEFINE OR OVERWRITE THIS PROPERTY BY YOUR OWN!
     * 
     * Gets the ID of that item.
     */
    readonly __id: any;
    /**
     * [INTERNAL] DO NOT DEFINE OR OVERWRITE THIS PROPERTY BY YOUR OWN!
     * 
     * Gets the zero-based of that item.
     */
    readonly __index: number;
    /**
     * [INTERNAL] DO NOT DEFINE OR OVERWRITE THIS PROPERTY BY YOUR OWN!
     * 
     * A value for comparison.
     */
    readonly __searchValue: any;
    /**
     * [INTERNAL] DO NOT DEFINE OR OVERWRITE THIS PROPERTY BY YOUR OWN!
     * 
     * Gets the underlying workspace.
     */
    readonly __workspace: Workspace;
}


const FILES_CHANGES: { [path: string]: deploy_contracts.FileChangeType } = {};

/**
 * A workspace.
 */
export class Workspace extends Events.EventEmitter implements deploy_contracts.Translator, vscode.Disposable {
    /**
     * Stores the current configuration.
     */
    protected _config: deploy_contracts.Configuration;
    /**
     * Stores the source of the configuration data.
     */
    protected _configSource: deploy_contracts.ConfigSource;
    /**
     * Stores all disposable items.
     */
    protected readonly _DISPOSABLES: vscode.Disposable[] = [];
    /**
     * Stores if workspace has been initialized or not.
     */
    protected _isInitialized = false;
    /**
     * Stores if configuration is currently reloaded or not.
     */
    protected _isReloadingConfig = false;
    /**
     * The current translation function.
     */
    protected _translator: i18next.TranslationFunction;

    /**
     * Initializes a new instance of that class.
     * 
     * @param {any} id The ID.
     * @param {vscode.WorkspaceFolder} folder The underlying folder.
     * @param {WorkspaceContext} context the current extension context.
     */
    constructor(public readonly id: any,
                public readonly folder: vscode.WorkspaceFolder,
                public readonly context: WorkspaceContext) {
        super();
    }

    /**
     * Checks if an object can be handled by that workspace.
     * 
     * @param {WorkspaceItem|WorkspaceItemFromSettings} obj The object to check.
     * 
     * @return {boolean} Can be handled or not.
     */
    public canBeHandledByMe(obj: WorkspaceItem | WorkspaceItemFromSettings) {
        if (obj) {
            const WORKSPACE = (<any>obj).__workspace || (<any>obj).workspace;
            if (WORKSPACE instanceof Workspace) {
                return Path.resolve(WORKSPACE.folder.uri.fsPath) ===
                       Path.resolve(this.folder.uri.fsPath);
            }
        }

        return false;
    }

    /**
     * Gets the current configuration.
     */
    public get config(): deploy_contracts.Configuration {
        return this._config;
    }

    /**
     * Gets the config source.
     */
    public get configSource(): deploy_contracts.ConfigSource {
        return this._configSource;
    }

    /**
     * Deletes a file in a target.
     * 
     * @param {string} file The file to delete.
     * @param {deploy_targets.Target} target The target to delete in.
     * @param {boolean} [askForDeleteLocalFile] Also ask for deleting the local file or not.
     */
    public async deleteFileIn(file: string, target: deploy_targets.Target,
                              askForDeleteLocalFile = true) {
        return await deploy_delete.deleteFileIn
                                  .apply(this, arguments);
    }

    /**
     * Deletes a package.
     * 
     * @param {deploy_packages.Package} pkg The package to delete.
     * @param {boolean} [askForDeleteLocalFiles] Also ask for deleting the local files or not.
     */
    public async deletePackage(pkg: deploy_packages.Package,
                               askForDeleteLocalFiles = true) {
        return await deploy_delete.deletePackage
                                  .apply(this, arguments);
    }

    /**
     * Deploys a file to a target.
     * 
     * @param {string} file The file to deploy.
     * @param {deploy_targets.Target} target The target to deploy to.
     */
    public async deployFileTo(file: string, target: deploy_targets.Target) {
        return await deploy_deploy.deployFileTo
                                  .apply(this, arguments);
    }

    /**
     * Deploys a files to a target.
     * 
     * @param {string[]} files The files to deploy.
     * @param {deploy_targets.Target} target The target to deploy to.
     * @param {number} [targetNr] The number of the target.
     */
    protected async deployFilesTo(files: string[],
                                  target: deploy_targets.Target, targetNr?: number) {
        return await deploy_deploy.deployFilesTo
                                  .apply(this, arguments);
    }

    /**
     * Deploys a file when is has been changed.
     * 
     * @param {string} file The file to check. 
     */
    protected async deployOnChange(file: string) {
        if (!deploy_helpers.isEmptyString(file)) {
            if (!this.isInSettingsFolder(file)) {
                return await deploy_deploy.deployOnChange
                                          .apply(this, arguments);
            }
        }
    }

    /**
     * Deploys a file when is has been saved.
     * 
     * @param {string} file The file to check. 
     */
    protected async deployOnSave(file: string) {
        if (!deploy_helpers.isEmptyString(file)) {
            if (!this.isInSettingsFolder(file)) {
                return await deploy_deploy.deployOnSave
                                          .apply(this, arguments);
            }
        }
    }

    /**
     * Deploys a package.
     * 
     * @param {deploy_packages.Package} pkg The package to deploy. 
     */
    public async deployPackage(pkg: deploy_packages.Package) {
        return await deploy_deploy.deployPackage
                                  .apply(this, arguments);
    }

    /** @inheritdoc */
    public dispose() {
        const ME = this;

        ME.removeAllListeners();

        while (ME._DISPOSABLES.length > 0) {
            const DISP = ME._DISPOSABLES.pop();

            deploy_helpers.tryDispose(DISP);
        }
    }

    /**
     * Finds files inside that workspace.
     * 
     * @param {deploy_contracts.FileFilter} filter The filter to use.
     * @param {Glob.IOptions} [opts] Custom options.
     * 
     * @return {Promise<string[]>} The promise with the found files.
     */
    public async findFilesByFilter(filter: deploy_contracts.FileFilter, opts?: Glob.IOptions) {
        if (!filter) {
            filter = <any>{};
        }

        let patterns = deploy_helpers.asArray(filter.files).map(p => {
            return deploy_helpers.toStringSafe(p);
        }).filter(p => !deploy_helpers.isEmptyString(p));

        let exclude = deploy_helpers.asArray(filter.exclude).map(e => {
            return deploy_helpers.toStringSafe(e);
        }).filter(e => !deploy_helpers.isEmptyString(e));
        if (exclude.length < 1) {
            exclude = undefined;
        }

        const DEFAULT_OPTS: Glob.IOptions = {
            cwd: this.folder.uri.fsPath,
            ignore: exclude,
            root: this.folder.uri.fsPath,
        };

        return await deploy_helpers.glob(patterns,
                                         MergeDeep(DEFAULT_OPTS, opts));
    }

    /**
     * Returns the ID of a package.
     * 
     * @param {deploy_packages.Package} package The package.
     * 
     * @return {string|false} The ID or (false) if package is invalid.
     */
    public getPackageId(pkg: deploy_packages.Package): string | false {
        if (!pkg) {
            return;
        }

        if (!this.canBeHandledByMe(pkg)) {
            return false;
        }

        return `${this.id}\n` + 
               `${pkg.__index}\n` + 
               `${deploy_helpers.normalizeString( deploy_packages.getPackageName(pkg) )}\n` + 
               `${this.configSource.resource.fsPath}`;
    }

    /**
     * Returns the list of packages as defined in the settings.
     */
    public getPackages(): deploy_packages.Package[] {
        const ME = this;

        const CFG = ME.config;
        if (!CFG) {
            return;
        }

        let index = -1;

        return Enumerable.from( deploy_helpers.asArray(CFG.packages) ).where(p => {
            return 'object' === typeof p;
        }).select(p => {
            return deploy_helpers.cloneObject(p);
        }).pipe(p => {
            ++index;

            (<any>p)['__index'] = index;
            (<any>p)['__workspace'] = ME;

            // can only be defined AFTER '__workspace'!
            (<any>p)['__id'] = ME.getPackageId(p);
            (<any>p)['__searchValue'] = deploy_helpers.normalizeString(
                deploy_packages.getPackageName(p)
            );
        }).toArray();
    }

    /**
     * Returns the ID of a target.
     * 
     * @param {deploy_targets.Target} target The target.
     * 
     * @return {string|false} The ID or (false) if target is invalid.
     */
    public getTargetId(target: deploy_targets.Target): string | false {
        if (!target) {
            return;
        }

        if (!this.canBeHandledByMe(target)) {
            return false;
        }

        return `${this.id}\n` + 
               `${target.__index}\n` + 
               `${deploy_helpers.normalizeString( deploy_targets.getTargetName(target) )}` + 
               `${this.configSource.resource.fsPath}`;
    }

    /**
     * Returns the list of targets as defined in the settings.
     */
    public getTargets(): deploy_targets.Target[] {
        const ME = this;

        const CFG = ME.config;
        if (!CFG) {
            return;
        }

        let index = -1;

        return Enumerable.from( deploy_helpers.asArray(CFG.targets) ).where(t => {
            return 'object' === typeof t;
        }).select(t => {
            return deploy_helpers.cloneObject(t);
        }).pipe(t => {
            ++index;

            (<any>t)['__index'] = index;
            (<any>t)['__workspace'] = ME;

            // can only be defined AFTER '__workspace'!
            (<any>t)['__id'] = ME.getTargetId(t);
            (<any>t)['__searchValue'] = deploy_helpers.normalizeString(
                deploy_targets.getTargetName(t)
            );
        }).toArray();
    }

    /**
     * Initializes that workspace.
     * 
     * @return {Promise<boolean>} The promise that indicates if operation was successful or not.
     */
    public async initialize() {
        const ME = this;

        if (ME.isInitialized) {
            return false;
        }

        // settings file
        {
            interface SettingsData {
                file: string;
                section: string;
            }

            const ALTERNATIVE_FILENAME = './.vscode/deploy.json';
            const ALTERNATIVE_SECTION_NAME = 'deploy';
            const DEFAULT_DIR = this.folder.uri.fsPath;
            const DEFAULT_FILENAME = './.vscode/settings.json';
            const DEFAULT_FILE = Path.join(
                DEFAULT_DIR,
                DEFAULT_FILENAME,
            );
            const DEFAULT_SECTION_NAME = 'deploy.reloaded';

            let settingsData: SettingsData | false = false;

            let searchForNextFile: (dir: string) => Promise<SettingsData | false>;
            searchForNextFile = async (dir: string) => {
                try {
                    dir = Path.resolve(dir);

                    const POSSIBLE_FILES: SettingsData[] = [
                        // deploy.json
                        /* TODO: implement later
                        {
                            section: ALTERNATIVE_SECTION_NAME,
                            file: Path.resolve(
                                Path.join(dir, ALTERNATIVE_FILENAME)
                            )
                        },*/

                        // settings.json
                        {
                            section: DEFAULT_SECTION_NAME,
                            file: Path.resolve(
                                Path.join(dir, DEFAULT_FILENAME)
                            )
                        }
                    ];

                    for (const ITEM of POSSIBLE_FILES) {
                        if (await deploy_helpers.exists(ITEM.file)) {
                            if ((await deploy_helpers.lstat(ITEM.file)).isFile()) {
                                return ITEM;  // found
                            }
                        }
                    }

                    const PARENT_DIR = Path.resolve(
                        Path.join(dir, '../')
                    );
                    if (dir !== PARENT_DIR && !deploy_helpers.isEmptyString(PARENT_DIR)) {
                        return await searchForNextFile(PARENT_DIR);
                    }
                }
                catch (e) {
                    deploy_log.CONSOLE
                              .trace(e, 'workspaces.Workspace.initialize()');
                }

                return false;
            };

            settingsData = await searchForNextFile(DEFAULT_DIR);
            if (false === settingsData) {
                // use default

                settingsData = {
                    file: DEFAULT_FILE,
                    section: DEFAULT_SECTION_NAME,
                };
            }

            ME._configSource = {
                section: settingsData.section,
                resource: vscode.Uri.file(settingsData.file),
            };
        }

        await ME.reloadConfiguration();

        ME._isInitialized = true;
        return true;
    }

    /**
     * Gets if the workspace has been initialized or not.
     */
    public get isInitialized() {
        return this._isInitialized;
    }

    /**
     * Checks if a path is inside the settings folder.
     * 
     * @param {string} path The path to check.
     * 
     * @return {boolean} Is in settings folder or not.
     */
    public isInSettingsFolder(path: string) {
        const SETTINGS_DIR = Path.resolve(
            Path.dirname(this.configSource.resource.fsPath)
        );
        
        path = deploy_helpers.toStringSafe(path);
        if (!Path.isAbsolute(path)) {
            return true;
        }
        path = Path.resolve(path);

        return path.startsWith(SETTINGS_DIR);
    }

    /**
     * Checks if a path is part of that workspace.
     * 
     * @param {string} path The path to check.
     * 
     * @return {boolean} Is part of that workspace or not. 
     */
    public isPathOf(path: string) {
        return false !== this.toFullPath(path);
    }

    /**
     * Is invoked when the active text editor changed.
     * 
     * @param {vscode.TextEditor} editor The new editor.
     */
    public async onDidChangeActiveTextEditor(editor: vscode.TextEditor) {
    }

    /**
     * Is invoked when configuration changes.
     * 
     * @param {vscode.ConfigurationChangeEvent} e The event data.
     */
    public async onDidChangeConfiguration(e: vscode.ConfigurationChangeEvent) {
        await this.reloadConfiguration();
    }

    /**
     * Is invoked on a file / directory change.
     * 
     * @param {vscode.Uri} e The URI of the item.
     * @param {deploy_contracts.FileChangeType} type The type of change.
     */
    public async onDidFileChange(e: vscode.Uri, type: deploy_contracts.FileChangeType, retry = true) {
        const ME = this;

        if (!ME.isPathOf(e.fsPath)) {
            return;
        }

        const MY_ARGS = arguments;

        if ('undefined' !== typeof FILES_CHANGES[e.fsPath]) {
            if (retry) {
                await deploy_helpers.invokeAfter(async () => {
                    await ME.onDidFileChange
                            .apply(ME, MY_ARGS);
                });
            }

            return;
        }
        FILES_CHANGES[e.fsPath] = type;

        try {
            switch (type) {
                case deploy_contracts.FileChangeType.Changed:
                    await this.deployOnChange(e.fsPath);
                    break;

                case deploy_contracts.FileChangeType.Created:
                    await this.deployOnChange(e.fsPath);
                    break;

                case deploy_contracts.FileChangeType.Deleted:
                    await ME.removeOnChange(e.fsPath);
                    break;
            }
        }
        finally {
            delete FILES_CHANGES[e.fsPath];
        }
    }

    /**
     * Is invoked when a text document has been changed.
     * 
     * @param {vscode.TextDocument} e The underlying text document.
     */
    public async onDidSaveTextDocument(e: vscode.TextDocument) {
        if (!e) {
            return;
        }
        
        await this.deployOnSave(e.fileName);
    }

    /**
     * List the root directory on a target.
     * 
     * @param {deploy_targets.Target} target The target from where to list.
     */
    public async listDirectory(target: deploy_targets.Target) {
        return await deploy_list.listDirectory
                                .apply(this, [ target ]);
    }

    /**
     * Pulls a file from a target.
     * 
     * @param {string} file The file to pull.
     * @param {deploy_targets.Target} target The target from where to pull from.
     */
    public async pullFileFrom(file: string, target: deploy_targets.Target) {
        return await deploy_pull.pullFileFrom
                                .apply(this, arguments);
    }

    /**
     * Pulls files from a target.
     * 
     * @param {string[]} files The files to pull.
     * @param {deploy_targets.Target} target The target to pull from.
     * @param {number} [targetNr] The number of the target.
     */
    protected async pullFilesFrom(files: string[],
                                  target: deploy_targets.Target, targetNr?: number) {
        return await deploy_pull.pullFilesFrom
                                .apply(this, arguments);
    }

    /**
     * Pulls a package.
     * 
     * @param {deploy_packages.Package} pkg The package to pull. 
     */
    public async pullPackage(pkg: deploy_packages.Package) {
        return await deploy_pull.pullPackage
                                .apply(this, arguments);
    }

    /**
     * Reloads the current configuration for that workspace.
     * 
     * @param {boolean} [retry] Retry when busy or not. 
     */
    public async reloadConfiguration(retry = true) {
        const ME = this;

        if (ME._isReloadingConfig) {
            if (retry) {
                await deploy_helpers.invokeAfter(async () => {
                    await ME.reloadConfiguration();
                });
            }

            return;
        }
        ME._isReloadingConfig = true;

        try {
            const LOADED_CFG: deploy_contracts.Configuration = vscode.workspace.getConfiguration(ME.configSource.section,
                                                                                                 ME.configSource.resource) || <any>{};

            const OLD_CFG = ME._config;
            ME._config = LOADED_CFG;
            try {
                ME.emit(deploy_contracts.EVENT_CONFIG_RELOADED,
                        ME, LOADED_CFG, OLD_CFG);
            }
            catch (e) {
                deploy_log.CONSOLE
                          .trace(e, 'workspaces.reloadConfiguration(1)');
            }

            ME._translator = null;
            try {
                ME._translator = await deploy_i18.init(ME);
            }
            catch (e) {
                deploy_log.CONSOLE
                          .trace(e, 'workspaces.reloadConfiguration(2)');
            }
        }
        finally {
            ME._isReloadingConfig = false;
        }
    }

    /**
     * Handles a file for "remove on change" feature.
     * 
     * @param {string} file The file to check.
     */
    protected async removeOnChange(file: string) {
        if (!deploy_helpers.isEmptyString(file)) {
            if (!this.isInSettingsFolder(file)) {
                await deploy_delete.removeOnChange
                                   .apply(this, arguments);
            }
        }
    }

    /** @inheritdoc */
    public t(key: string, ...args: any[]): string {
        const TRANSLATOR = this._translator;
        if (TRANSLATOR) {
            let formatStr = TRANSLATOR(deploy_helpers.toStringSafe(key));
            formatStr = deploy_helpers.toStringSafe(formatStr);
    
            return deploy_helpers.formatArray(formatStr, args);
        }

        return key;
    }

    /**
     * Extracts the name and (relative) path from a file.
     * 
     * @param {string} file The file (path).
     * 
     * @return {deploy_contracts.WithNameAndPath|false} The extracted data or (false) if file path is invalid.
     */
    public toNameAndPath(file: string): deploy_contracts.WithNameAndPath | false {
        if (deploy_helpers.isEmptyString(file)) {
            return;
        }

        let workspaceDir = Path.resolve(this.folder.uri.fsPath);
        workspaceDir = deploy_helpers.replaceAllStrings(workspaceDir, Path.sep, '/');

        if (!Path.isAbsolute(file)) {
            Path.join(workspaceDir, file);
        }
        file = Path.resolve(file);
        file = deploy_helpers.replaceAllStrings(file, Path.sep, '/');

        if (!file.startsWith(workspaceDir)) {
            return false;
        }

        const NAME = Path.basename(file);

        let relativePath = Path.dirname(file).substr(workspaceDir.length);
        while (relativePath.startsWith('/')) {
            relativePath = relativePath.substr(1);
        }
        while (relativePath.endsWith('/')) {
            relativePath = relativePath.substr(0, relativePath.length - 1);
        }

        if ('' === relativePath.trim()) {
            relativePath = '';
        }

        return {
            name: NAME,
            path: relativePath,
        };
    }

    /**
     * Converts to a full path.
     * 
     * @param {string} path The path to convert.
     * 
     * @return {string|false} The pull path or (false) if 'path' could not be converted.
     */
    public toFullPath(path: string): string | false {
        const RELATIVE_PATH = this.toRelativePath(path);
        if (false === RELATIVE_PATH) {
            return false;
        }

        return Path.resolve(
            Path.join(
                this.folder.uri.fsPath,
                RELATIVE_PATH
            )
        );
    }

    /**
     * Converts to a relative path.
     * 
     * @param {string} path The path to convert.
     * 
     * @return {string|false} The relative path or (false) if 'path' could not be converted.
     */
    public toRelativePath(path: string): string | false {
        path = deploy_helpers.toStringSafe(path);

        path = deploy_helpers.replaceAllStrings(
            Path.resolve(path),
            Path.sep,
            '/'
        );

        const WORKSPACE_DIR = deploy_helpers.replaceAllStrings(
            Path.resolve(this.folder.uri.fsPath),
            Path.sep,
            '/'
        );

        if (!path.startsWith(WORKSPACE_DIR)) {
            return false;
        }

        let relativePath = path.substr(WORKSPACE_DIR.length);
        while (relativePath.startsWith('/')) {
            relativePath = relativePath.substr(1);
        }
        while (relativePath.endsWith('/')) {
            relativePath = relativePath.substr(0, relativePath.length - 1);
        }

        return relativePath;
    }
}


/**
 * Returns the display name of a workspace.
 * 
 * @param {Workspace} ws The workspace.
 * 
 * @return {string} The name.
 */
export function getWorkspaceName(ws: Workspace): string {
    if (!ws) {
        return;
    }

    return Path.basename(
        ws.folder.uri.fsPath
    );
}