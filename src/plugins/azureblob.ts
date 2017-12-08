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

import * as deploy_clients_azureblob from '../clients/azureblob';
import * as deploy_files from '../files';
import * as deploy_log from '../log';
import * as deploy_plugins from '../plugins';
import * as deploy_targets from '../targets';


interface AzureBlobContext extends deploy_plugins.AsyncFileClientPluginContext<AzureBlobTarget,
                                                                               deploy_clients_azureblob.AzureBlobClient> {
}

/**
 * An 'Azure blob' target.
 */
export interface AzureBlobTarget extends deploy_targets.Target {
    /**
     * The access key.
     */
    readonly accessKey?: string;
    /**
     * The account name.
     */
    readonly account?: string;
    /**
     * The container name.
     */
    readonly container?: string;
    /**
     * The custom root directory. 
     */
    readonly dir?: string;
    /**
     * Hash content or not.
     */
    readonly hashContent?: boolean;
    /**
     * The custom host address.
     */
    readonly host?: string;
    /**
     * Use local development storage or not.
     */
    readonly useDevelopmentStorage?: boolean;
}


class AzureBlobPlugin extends deploy_plugins.AsyncFileClientPluginBase<AzureBlobTarget,
                                                                       deploy_clients_azureblob.AzureBlobClient,
                                                                       AzureBlobContext> {
    public async createContext(target: AzureBlobTarget): Promise<AzureBlobContext> {
        return {
            client: await deploy_clients_azureblob.createClient({
                accessKey: target.accessKey,
                account: target.account,
                container: target.container,
                hashContent: target.hashContent,
                host: target.host,
                useDevelopmentStorage: target.useDevelopmentStorage,
            }),
            getDir: (subDir) => {
                return deploy_clients_azureblob.normalizePath(
                    deploy_clients_azureblob.normalizePath(target.dir).trim() + 
                    '/' + 
                    deploy_clients_azureblob.normalizePath(subDir).trim()
                );
            },
            target: target
        };
    }
}

/**
 * Creates a new instance of that plugin.
 * 
 * @param {deploy_plugins.PluginContext} context The context for the plugin.
 * 
 * @return {deploy_plugins.Plugin} The new plugin.
 */
export function createPlugins(context: deploy_plugins.PluginContext) {
    return new AzureBlobPlugin(context);
}