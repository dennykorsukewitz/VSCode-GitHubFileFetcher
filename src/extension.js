// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const { default: fetch } = require('node-fetch');
require('buffer');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    // console.log('Congratulations, your extension "GitHubFileFetcher" is now active!');

    // This function searches and fetches files from GitHub.
    initGitHubFileFetcher(context);
}

function initGitHubFileFetcher(context) {

    const gitHubFileFetcherId = 'gitHubFileFetcher';
    context.subscriptions.push(vscode.commands.registerCommand(gitHubFileFetcherId, async () => {

        // Return if no workspaceFolder is available
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showWarningMessage(`GitHubFileFetcher: No Workspace Folder is available. Please open a folder before.`)
            vscode.commands.executeCommand('workbench.action.addRootFolder');
            return;
        }

        // Get Config.
        let url,
            response,
            json,
            newRepoFound = 0,
            searchOwnerString = '-- Search Owner --',
            searchRepoString = '-- Search Repository --',
            config = vscode.workspace.getConfiguration('gitHubFileFetcher'),
            repositories = Object.assign([], config.repositories);

        if (!repositories.includes(searchRepoString)) {
            repositories.unshift(searchRepoString);
        }

        if (!repositories.includes(searchOwnerString)) {
            repositories.unshift(searchOwnerString);
        }

        // Create Owner/Repository Selection.
        if (config.informationMessages != 'false') {
            vscode.window.showInformationMessage(`GitHubFileFetcher (1/6): Fetching GitHub repositories.`);
        }
        let ownerRepository = await vscode.window.showQuickPick(repositories, {
            title: 'GitHubFileFetcher (1/6)',
            placeHolder: 'GitHubFileFetcher: Search/Select GitHub repositories...',
            canPickMany: false,
        });

        if (!ownerRepository) return;

        let foundRepositories = [];
        if (ownerRepository == searchOwnerString || ownerRepository == searchRepoString) {

            let message,
                value,
                placeHolder,
                url = `https://api.github.com/search/repositories?q=`;

            if (ownerRepository == searchOwnerString) {
                value = 'Owner';
                message = `Enter GitHub ${value}. Example: dennykorsukewitz`;
            }
            else if (ownerRepository == searchRepoString) {
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

            if (ownerRepository == searchOwnerString) {
                searchString += '/';
            }

            url += `${searchString}`;

            // Log.
            if (config.informationMessages == 'verbose') {
                vscode.window.showInformationMessage(`GitHubFileFetcher: Fetching ${value} from url: "${url}".`);
            }

            response = await fetch(url);
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
                if (!ownerRepository) return;
                newRepoFound = 1;
            }
        }

        if (!ownerRepository) return;

        // Create Branch Selection.
        url = `https://api.github.com/repos/${ownerRepository}/branches`;
        if (config.informationMessages != 'false') {
            let message = `GitHubFileFetcher (2/6): Fetching branches.`;
            if (config.informationMessages == 'verbose') {
                message = `GitHubFileFetcher (2/6): Fetching branches from "${url}".`;
            }
            vscode.window.showInformationMessage(message);
        }

        response = await fetch(url);
        json = await response.json();
        let branches = [];

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
        if (!branch) return;

        // Get all possible files.
        url = `https://api.github.com/repos/${ownerRepository}/git/trees/${branch}?recursive=1`

        if (config.informationMessages != 'false') {
            let message = `GitHubFileFetcher (3/6): Fetching files.`;
            if (config.informationMessages == 'verbose') {
                message = `GitHubFileFetcher (3/6): Fetching files from "${url}".`;
            }
            vscode.window.showInformationMessage(message)
        }

        response = await fetch(url);
        json = await response.json();
        let files = [];

        if (json.message) {
            vscode.window.showErrorMessage(`GitHubFileFetcher: ${json.message}.`);
            return;
        }

        json.tree.forEach(function (file) {
            if (file.type == 'tree') return false;
            files.push(file.path);
        });

        let file = await vscode.window.showQuickPick(files, {
            title: 'GitHubFileFetcher (3/6)',
            placeHolder: 'GitHubFileFetcher: Select file...',
            canPickMany: false,
        });
        if (!file) return;

        // Get all workspace foldes.
        let workspaceFolders = [];
        vscode.workspace.workspaceFolders.forEach(workspaceFolder => {
            workspaceFolders.push(workspaceFolder.uri.path)
        })

        if (config.informationMessages != 'false') {
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
        if (config.informationMessages == 'verbose') {
            vscode.window.showInformationMessage(`GitHubFileFetcher: Fetching file data for file: "${file}" from branch: "${branch}" from url: "${url}".`);
        }

        response = await fetch(url);
        json = await response.json();
        if (json.message) {
            vscode.window.showErrorMessage(`GitHubFileFetcher: ${json.message}.`);
            return;
        }

        let content = Buffer.from(json['content'], 'base64').toString('utf-8');
        if (!content) {
            vscode.window.showErrorMessage(`GitHubFileFetcher: No file content exists.`);
            return;
        }

        // Log.
        if (config.informationMessages == 'verbose') {
            vscode.window.showInformationMessage(`GitHubFileFetcher: Decoded file: "${file}" from branch: "${branch}".`);
        }

        const wsEdit = new vscode.WorkspaceEdit();

        file = await vscode.window.showInputBox({
            title: 'GitHubFileFetcher (5/6)',
            placeHolder: `GitHubFileFetcher: Enter or change destination file path...`,
            value: file,
            prompt: `GitHubFileFetcher: Enter or change destination file path...`,
        });

        const filePath = vscode.Uri.file(workspaceFolder + '/' + file);

        if (!filePath) {
            vscode.window.showErrorMessage(`GitHubFileFetcher: No filePath exists.`)
            return;
        }

        wsEdit.createFile(filePath, { ignoreIfExists: true });
        wsEdit.insert(filePath, new vscode.Position(0, 0), content);

        // Apply all changes.
        vscode.workspace.applyEdit(wsEdit);
        if (config.informationMessages != 'false') {
            vscode.window.showInformationMessage(`GitHubFileFetcher (6/6): Added file ${filePath.path} `);
        }

        if (newRepoFound) {
            let addNewRepoToConfig = await vscode.window.showQuickPick(['yes', 'no'], {
                title: 'GitHubFileFetcher (New Repository)',
                placeHolder: 'GitHubFileFetcher: Should I save the new repository in the settings?',
                canPickMany: false,
            });

            if (addNewRepoToConfig == 'yes') {

                let configRepositories = config.repositories;
                configRepositories.push(ownerRepository);

                await vscode.workspace.getConfiguration().update('gitHubFileFetcher.repositories', configRepositories, true);
            }
        }
    }))
}

// This method is called when your extension is deactivated.
function deactivate() { }

module.exports = {
    activate,
    deactivate
}
