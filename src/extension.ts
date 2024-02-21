import * as vscode from 'vscode';

const toUint8Array = require('base64-to-uint8array');

/**
 * @param {vscode.ExtensionContext} context
 */
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    // console.log('Congratulations, your extension "GitHubFileFetcher" is now active!');

    // This function searches and fetches files from GitHub.
    initGitHubFileFetcher(context);
}

function initGitHubFileFetcher(context: vscode.ExtensionContext) {

    const gitHubFileFetcherId = 'gitHubFileFetcher';
    context.subscriptions.push(vscode.commands.registerCommand(gitHubFileFetcherId, async () => {

        // Return if no workspaceFolder is available
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showWarningMessage(`GitHubFileFetcher: No Workspace Folder is available. Please open a folder before.`);
            vscode.commands.executeCommand('workbench.action.addRootFolder');
            return;
        }

        // Get Config.
        let url,
            response,
            json: any,
            newRepoFound : Boolean = false,
            searchOwnerString : string = '-- Search Owner --',
            searchRepoString : string = '-- Search Repository --',
            options : any = {},
            config = vscode.workspace.getConfiguration('gitHubFileFetcher'),
            repositories = Object.assign([], config.repositories);

        if (
            config.githubUsername
            && config.githubToken
            && config.githubUsername.length > 0
            && config.githubToken.length > 0
        ){
            let credentials = btoa(`${config.githubUsername}:${config.githubToken}`);
            options = {
                headers: {'Authorization': `Basic ${credentials}`}
            };
        }

        if (!repositories.includes(searchRepoString)) {
            repositories.unshift(searchRepoString);
        }

        if (!repositories.includes(searchOwnerString)) {
            repositories.unshift(searchOwnerString);
        }

        // Create Owner/Repository Selection.
        if (config.informationMessages !== 'false') {
            vscode.window.showInformationMessage(`GitHubFileFetcher (1/6): Fetching GitHub repositories.`);
        }
        let ownerRepository = await vscode.window.showQuickPick(repositories, {
            title: 'GitHubFileFetcher (1/6)',
            placeHolder: 'GitHubFileFetcher: Search/Select GitHub repositories...',
            canPickMany: false,
        });

        if (!ownerRepository) {return;}

        let foundRepositories: any[] = [];
        if (ownerRepository === searchOwnerString || ownerRepository === searchRepoString) {

            let message : string = '',
                value : string = '',
                placeHolder : string = '',
                url : string = `https://api.github.com/search/repositories?q=`;

            if (ownerRepository === searchOwnerString) {
                value = 'Owner';
                message = `Enter GitHub ${value}. Example: dennykorsukewitz`;
            }
            else if (ownerRepository === searchRepoString) {
                value = 'Repositories';
                message = `Enter GitHub ${value} Example: VSCode-GitHubFileFetcher`;
            }
            placeHolder = `GitHubFileFetcher: Search for GitHub ${value}...`;

            let searchString = await vscode.window.showInputBox({
                title: 'GitHubFileFetcher (1/6)',
                placeHolder: placeHolder,
                value: value,
                prompt: message,
            });

            if (ownerRepository === searchOwnerString) {
                searchString += '/';
            }

            url += `${searchString}`;

            // Log.
            if (config.informationMessages === 'verbose') {
                vscode.window.showInformationMessage(`GitHubFileFetcher: Fetching ${value} from url: "${url}".`);
            }

            response = await fetch(url, options);
            json = await response.json();

            Object.keys(json.items).forEach(function (index) {
                foundRepositories.push(json.items[index].full_name);
            });

            if (foundRepositories) {
                ownerRepository = await vscode.window.showQuickPick(foundRepositories, {
                    title: 'GitHubFileFetcher (1/6)',
                    placeHolder: 'GitHubFileFetcher: Select GitHub repositories...',
                    canPickMany: false,
                });
                if (!ownerRepository) {return;}
                newRepoFound = true;
            }
        }

        if (!ownerRepository) {return;}

        // Create Branch Selection.
        url = `https://api.github.com/repos/${ownerRepository}/branches`;
        if (config.informationMessages !== 'false') {
            let message = `GitHubFileFetcher (2/6): Fetching branches.`;
            if (config.informationMessages === 'verbose') {
                message = `GitHubFileFetcher (2/6): Fetching branches from "${url}".`;
            }
            vscode.window.showInformationMessage(message);
        }

        response = await fetch(url, options);
        json = await response.json();
        let branches: string[] = [];

        if (json.message) {
            vscode.window.showErrorMessage(`GitHubFileFetcher: ${json.message}.`);
            return;
        }

        Object.keys(json).forEach(function (key) {
            branches.push(json[key].name);
        });

        const branch = await vscode.window.showQuickPick(branches.reverse(), {
            title: 'GitHubFileFetcher (2/6)',
            placeHolder: 'GitHubFileFetcher: Select branch...',
            canPickMany: false,
        });
        if (!branch) {return;}

        // Get all possible files.
        url = `https://api.github.com/repos/${ownerRepository}/git/trees/${branch}?recursive=1`;

        if (config.informationMessages !== 'false') {
            let message = `GitHubFileFetcher (3/6): Fetching files.`;
            if (config.informationMessages === 'verbose') {
                message = `GitHubFileFetcher (3/6): Fetching files from "${url}".`;
            }
            vscode.window.showInformationMessage(message);
        }

        response = await fetch(url, options);
        json = await response.json();
        let files : string[] = [];

        if (json.message) {
            vscode.window.showErrorMessage(`GitHubFileFetcher: ${json.message}.`);
            return;
        }

        json.tree.forEach(function (file: any) {
            if (file.type === 'tree') {return false;}
            files.push(file.path);
        });

        let file = await vscode.window.showQuickPick(files, {
            title: 'GitHubFileFetcher (3/6)',
            placeHolder: 'GitHubFileFetcher: Select file...',
            canPickMany: false,
        });
        if (!file) {return;}

        // Get all workspace folders.
        let workspaceFolders : string[] = [];
        vscode.workspace.workspaceFolders.forEach(workspaceFolder => {
            workspaceFolders.push(workspaceFolder.uri.path);
        });

        if (config.informationMessages !== 'false') {
            vscode.window.showInformationMessage(`GitHubFileFetcher (4/6): Fetching destination workspace.`);
        }

        let workspaceFolder = await vscode.window.showQuickPick(workspaceFolders, {
            title: 'GitHubFileFetcher (4/6)',
            placeHolder: 'GitHubFileFetcher: Select destination workspace...',
            canPickMany: false,
        });
        if (!workspaceFolder) {
            vscode.window.showErrorMessage(`GitHubFileFetcher: No Workspace Folder exists.`);
            return;
        }

        // Get file data.
        url = `https://api.github.com/repos/${ownerRepository}/contents/${file}?ref=${branch}`;

        // Log.
        if (config.informationMessages === 'verbose') {
            vscode.window.showInformationMessage(`GitHubFileFetcher: Fetching file data for file: "${file}" from branch: "${branch}" from url: "${url}".`);
        }

        response = await fetch(url, options);
        json = await response.json();
        if (json.message) {
            vscode.window.showErrorMessage(`GitHubFileFetcher: ${json.message}.`);
            return;
        }


        const writeBytes = toUint8Array(json.content);
        const content = new Uint8Array(writeBytes);

        if (!content) {
            vscode.window.showErrorMessage(`GitHubFileFetcher: No file content exists.`);
            return;
        }

        // Log.
        if (config.informationMessages === 'verbose') {
            vscode.window.showInformationMessage(`GitHubFileFetcher: Decoded file: "${file}" from branch: "${branch}".`);
        }

        if (config.informationMessages !== 'false') {
            vscode.window.showInformationMessage(`GitHubFileFetcher (5/6): Enter destination file path.`);
        }

        file = await vscode.window.showInputBox({
            title: 'GitHubFileFetcher (5/6)',
            placeHolder: `GitHubFileFetcher: Enter or change destination file path...`,
            value: file,
            prompt: `GitHubFileFetcher: Enter or change destination file path...`,
        });

        const filePath = vscode.Uri.file(workspaceFolder + '/' + file);

        if (!filePath) {
            vscode.window.showErrorMessage(`GitHubFileFetcher: No filePath exists.`);
            return;
        }

        try {
            await vscode.workspace.fs.writeFile(filePath, content);

            if (config.informationMessages !== 'false') {
                vscode.window.showInformationMessage(`GitHubFileFetcher (6/6): Added file ${filePath.path}`);
            }
        } catch (err) {
            console.error(err);
            vscode.window.showErrorMessage(`GitHubFileFetcher: ${err}.`);
        }

        if (newRepoFound) {
            let addNewRepoToConfig = await vscode.window.showQuickPick(['yes', 'no'], {
                title: 'GitHubFileFetcher (New Repository)',
                placeHolder: 'GitHubFileFetcher: Should I save the new repository in the settings?',
                canPickMany: false,
            });

            if (addNewRepoToConfig === 'yes') {

                let configRepositories = config.repositories;
                configRepositories.push(ownerRepository);

                await vscode.workspace.getConfiguration().update('gitHubFileFetcher.repositories', configRepositories, true);
            }
        }
    }));
}

// This method is called when your extension is deactivated.
export function deactivate() { }
