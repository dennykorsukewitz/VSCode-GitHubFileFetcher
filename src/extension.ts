import * as vscode from 'vscode';

const toUint8Array = require('base64-to-uint8array');

let url,
    response,
    json: any,
    newRepoFound: Boolean = false,
    searchOwnerString: string = '-- Search Owner --',
    searchRepoString: string = '-- Search Repository --',
    options: any = {},
    config = vscode.workspace.getConfiguration('gitHubFileFetcher'),
    repositories = Object.assign([], config.repositories),
    ownerRepository: string = '',
    branch: any = '',
    file: string = '',
    workspaceFolder: string = '',
    fileContent: any = '',
    destinationFilePath: any = '';

/**
 * @param {vscode.ExtensionContext} context
 */
export function activate(context: vscode.ExtensionContext) {

    // This function searches and fetches files from GitHub.
    let startDisposable = vscode.commands.registerCommand('gitHubFileFetcher', () => {
        startGitHubFileFetcher(context);
    });

    context.subscriptions.push(startDisposable);
}

async function startGitHubFileFetcher(context: vscode.ExtensionContext) {

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "GitHubFileFetcher",
        cancellable: true
    }, async (progress, token) => {

        token.onCancellationRequested(() => {
            console.log("User canceled the long running operation");
        });

        // Prepare the extension.
        progress.report({ increment: 0, message: "(0/6): Prepare..." });
        await pre(context);

        // Get the GitHub Owner/Repository.
        progress.report({ increment: 15, message: "(1/6): Fetching GitHub repositories." });
        ownerRepository = await getOwnerRepository(context) as string;
        if (!ownerRepository) { return; }

        // Get the GitHub Branch.
        progress.report({ increment: 15, message: "(2/6): Fetching branches." });
        branch = await getBranch(context) as string;
        if (!branch) { return; }

        // Get the GitHub File.
        progress.report({ increment: 15, message: "(3/6): Fetching files." });
        file = await getFile(context) as string;
        if (!file) { return; }

        // Get the destination workspace folder.
        progress.report({ increment: 15, message: "(4/6): Fetching destination workspace." });
        workspaceFolder = await getWorkspaceFolder(context) as string;
        if (!workspaceFolder) { return; }

        // Get the destination file path.
        progress.report({ increment: 15, message: "(5/6): Enter destination file path." });
        destinationFilePath = await getDestinationFilePath(context);
        if (!destinationFilePath) { return; }

        // Fetch the file content.
        fileContent = await fetchFile(context) as unknown as string;
        if (!fileContent) { return; }

        // Add the file to the workspace folder.
        progress.report({ increment: 25, message: `(6/6): Added file ${destinationFilePath.path}` });
        await addFile(context);

        // Add new repository to settings.
        await addNewRepoToSetting(context);

        // Done.
        const promise = new Promise<void>(resolve => {
            setTimeout(() => {
                resolve();
            }, 4000);
        });

        return promise;
    });
}

function pre(context: vscode.ExtensionContext) {

    // Return if no workspaceFolder is available
    if (!vscode.workspace.workspaceFolders) {
        vscode.window.showWarningMessage(`GitHubFileFetcher: No Workspace Folder is available. Please open a folder before.`);
        vscode.commands.executeCommand('workbench.action.addRootFolder');
        return;
    }

    if (
        config.githubUsername
        && config.githubToken
        && config.githubUsername.length > 0
        && config.githubToken.length > 0
    ) {
        let credentials = btoa(`${config.githubUsername}:${config.githubToken}`);
        options = {
            headers: { 'Authorization': `Basic ${credentials}` }
        };
    }

    if (!repositories.includes(searchRepoString)) {
        repositories.unshift(searchRepoString);
    }

    if (!repositories.includes(searchOwnerString)) {
        repositories.unshift(searchOwnerString);
    }
}

async function getOwnerRepository(context: vscode.ExtensionContext) {

    let ownerRepository = await vscode.window.showQuickPick(repositories, {
        title: 'GitHubFileFetcher (1/6)',
        placeHolder: 'GitHubFileFetcher: Search/Select GitHub repositories...',
        canPickMany: false,
    });

    if (!ownerRepository) { return; }

    let foundRepositories: any[] = [];
    if (ownerRepository === searchOwnerString || ownerRepository === searchRepoString) {

        let message: string = '',
            value: string = '',
            placeHolder: string = '',
            url: string = `https://api.github.com/search/repositories?q=`;

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
            if (!ownerRepository) { return; }
            newRepoFound = true;
        }
    }

    return ownerRepository;
}

async function getBranch(context: vscode.ExtensionContext) {

    // Create Branch Selection.
    url = `https://api.github.com/repos/${ownerRepository}/branches`;
    if (config.informationMessages === 'verbose') {
        let message = `GitHubFileFetcher (2/6): Fetching branches from "${url}".`;
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

    branch = await vscode.window.showQuickPick(branches.reverse(), {
        title: 'GitHubFileFetcher (2/6)',
        placeHolder: 'GitHubFileFetcher: Select branch...',
        canPickMany: false,
    });

    return branch;
}

async function getFile(context: vscode.ExtensionContext) {

    // Get all possible files.
    url = `https://api.github.com/repos/${ownerRepository}/git/trees/${branch}?recursive=1`;

    if (config.informationMessages === 'verbose') {
        let message = `GitHubFileFetcher (3/6): Fetching files from "${url}".`;
        vscode.window.showInformationMessage(message);
    }

    response = await fetch(url, options);
    json = await response.json();
    let files: string[] = [];

    if (json.message) {
        vscode.window.showErrorMessage(`GitHubFileFetcher: ${json.message}.`);
        return;
    }

    json.tree.forEach(function (file: any) {
        if (file.type === 'tree') { return false; }
        files.push(file.path);
    });

    let file: string | undefined = await vscode.window.showQuickPick(files, {
        title: 'GitHubFileFetcher (3/6)',
        placeHolder: 'GitHubFileFetcher: Select file...',
        canPickMany: false,
    });

    return file;
}

async function getWorkspaceFolder(context: vscode.ExtensionContext) {

    // Get all workspace folders.
    let workspaceFolders: string[] = [];
    if (vscode.workspace.workspaceFolders) {
        vscode.workspace.workspaceFolders.forEach(workspaceFolder => {
            workspaceFolders.push(workspaceFolder.uri.path);
        });
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

    return workspaceFolder;

}

async function getDestinationFilePath(context: vscode.ExtensionContext) {

    let destinationFile = await vscode.window.showInputBox({
        title: 'GitHubFileFetcher (5/6)',
        placeHolder: `GitHubFileFetcher: Enter or change destination file path...`,
        value: file,
        prompt: `GitHubFileFetcher: Enter or change destination file path...`,
    });

    destinationFilePath = vscode.Uri.file(workspaceFolder + '/' + destinationFile);

    let overwriteExistingFile = false;
    if (await vscode.workspace.fs.stat(destinationFilePath)) {

        let confirmOverwrite = await vscode.window.showQuickPick(['yes', 'no'], {
            title: 'GitHubFileFetcher (Overwrite)',
            placeHolder: 'GitHubFileFetcher: Destination file already exists. Overwrite?',
            canPickMany: false,
        });
        if (confirmOverwrite === 'yes') {
            overwriteExistingFile = true;
        }
    }

    if (!overwriteExistingFile) {
        while (true) {
            try {
                await vscode.workspace.fs.stat(destinationFilePath);
            } catch (error) {
                if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
                    // Exit the loop if the file does not exist
                    break;
                } else {
                    // Re-throw the error if it's not a FileNotFound error
                    throw error;
                }
            }

            vscode.window.showErrorMessage(`GitHubFileFetcher (5/6): Destination file already exists.`);
            destinationFile = await vscode.window.showInputBox({
                title: 'GitHubFileFetcher (5/6)',
                placeHolder: `GitHubFileFetcher: Enter or change destination file path...`,
                value: file,
                prompt: `GitHubFileFetcher: Enter or change destination file path...`,
            });
            destinationFilePath = vscode.Uri.file(workspaceFolder + '/' + destinationFile);
        }
    }

    if (!destinationFilePath) {
        vscode.window.showErrorMessage(`GitHubFileFetcher (5/6): No filePath exists.`);
        return;
    }

    return destinationFilePath;
}

async function fetchFile(context: vscode.ExtensionContext) {

// Get file data.
    url = `https://api.github.com/repos/${ownerRepository}/contents/${file}?ref=${branch}`;

    // Log.
    if (config.informationMessages === 'verbose') {
        vscode.window.showInformationMessage(`GitHubFileFetcher (6/6): Fetching file data for file: "${file}" from branch: "${branch}" from url: "${url}".`);
    }

    response = await fetch(url, options);
    json = await response.json();
    if (json.message) {
        vscode.window.showErrorMessage(`GitHubFileFetcher (6/6): ${json.message}.`);
        return;
    }

    const writeBytes = toUint8Array(json.content);
    fileContent = new Uint8Array(writeBytes);

    if (!fileContent) {
        vscode.window.showErrorMessage(`GitHubFileFetcher (6/6): No file content exists.`);
        return;
    }

    // Log.
    if (config.informationMessages === 'verbose') {
        vscode.window.showInformationMessage(`GitHubFileFetcher (6/6): Decoded file: "${file}" from branch: "${branch}".`);
    }

    return fileContent;
}

async function addFile(context: vscode.ExtensionContext) {
    try {
        await vscode.workspace.fs.writeFile(destinationFilePath, fileContent);
    } catch (err) {
        console.error(err);
        vscode.window.showErrorMessage(`GitHubFileFetcher (6/6): ${err}.`);
    }
}

async function addNewRepoToSetting(context: vscode.ExtensionContext) {

    if (!newRepoFound) { return; }

    let addNewRepoToSetting = await vscode.window.showQuickPick(['yes', 'no'], {
        title: 'GitHubFileFetcher (New Repository)',
        placeHolder: 'GitHubFileFetcher: Should I save the new repository in the settings?',
        canPickMany: false,
    });

    if (addNewRepoToSetting === 'yes') {

        let configRepositories = config.repositories;
        configRepositories.push(ownerRepository);

        await vscode.workspace.getConfiguration().update('gitHubFileFetcher.repositories', configRepositories, true);
    }
}

// This method is called when your extension is deactivated.
export function deactivate() { }
