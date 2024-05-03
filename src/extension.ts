import * as vscode from 'vscode';

const toUint8Array = require('base64-to-uint8array');

let newRepoFound: Boolean = false,
    searchOwnerString: string = '-- Search Owner --',
    searchRepoString: string = '-- Search Repository --',
    options: any = {},
    config = vscode.workspace.getConfiguration('gitHubFileFetcher'),
    repositories = Object.assign([], config.repositories);
;

/**
 * Activates the extension and registers commands and event listeners.
 * @param context - The extension context.
 */
export function activate(context: vscode.ExtensionContext) {

    /**
     * Command to start the GitHub File Fetcher.
     * This function searches and fetches files from GitHub.
     */
    let startCommand = vscode.commands.registerCommand('gitHubFileFetcher.start', () => {
        startGitHubFileFetcher(context);
    });

    /**
     * Command to check for updates.
     */
    let checkForUpdatesCommand = vscode.commands.registerCommand('gitHubFileFetcher.checkForUpdates', () => {
        checkForUpdates(context);
    });

    /**
     * Event listener for the `onDidChangeActiveTextEditor` event.
     * Triggers the `checkForUpdates` function when the active text editor changes.
     *
     * @param {vscode.TextEditor | undefined} editor - The active text editor.
     */
    let checkForUpdatesOnDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && config.checkForUpdates) {
            checkForUpdates(context);
        }
    });

    context.subscriptions.push(startCommand, checkForUpdatesCommand, checkForUpdatesOnDidChangeActiveTextEditor);

    // Listen for configuration changes
    handleConfigChange();
}

/**
 * Starts the GitHub File Fetcher extension.
 *
 * @param context - The extension context.
 * @returns A promise that resolves when the extension has finished running.
 */
async function startGitHubFileFetcher(context: vscode.ExtensionContext) {

    newRepoFound = false;
    options = getOptions();

    if (config.informationMessages !== 'false') {

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
            await pre();

            // Get the GitHub Owner/Repository.
            progress.report({ increment: 15, message: "(1/6): Fetching GitHub repositories." });
            let ownerRepository = await getOwnerRepository() as string;
            if (!ownerRepository) { return; }

            // Get the GitHub Branch.
            progress.report({ increment: 15, message: "(2/6): Fetching branches." });
            let branch = await getBranch({ownerRepository: ownerRepository}) as string;
            if (!branch) { return; }

            // Get the GitHub File.
            progress.report({ increment: 15, message: "(3/6): Fetching files." });
            let file = await getFile({ ownerRepository: ownerRepository, branch: branch }) as string;
            if (!file) { return; }

            // Get the destination workspace folder.
            progress.report({ increment: 15, message: "(4/6): Fetching destination workspace." });
            let workspaceFolder = await getWorkspaceFolder() as string;
            if (!workspaceFolder) { return; }

            // Get the destination file path.
            progress.report({ increment: 15, message: "(5/6): Enter destination file path." });
            let destination = await getDestination({ file: file, workspaceFolder: workspaceFolder });
            if (!destination) { return; }

            let destinationFile = destination.destinationFile;
            let destinationFilePath = destination.destinationFilePath;

            // Fetch the file content.
            let fileContent = await fetchFile({ ownerRepository: ownerRepository, file: file, branch: branch, }) as unknown as string;
            if (!fileContent) { return; }

            // Add the file to the workspace folder.
            progress.report({ increment: 25, message: `(6/6): Added file ${destinationFilePath.path}` });
            await addFile({ destinationFilePath: destinationFilePath, fileContent: fileContent });

            // Add new repository to settings.
            await addNewRepoToSetting({ ownerRepository: ownerRepository });

            // Add the workspace folders.
            await setWorkspaceFolders(context, { workspaceFolder: workspaceFolder, destinationFile: destinationFile, ownerRepository: ownerRepository, branch: branch, file: file });

            // Done.
            const promise = new Promise<void>(resolve => {
                setTimeout(() => {
                    resolve();
                }, 4000);
            });

            return promise;
        });

    }else{

        // Prepare the extension.
        await pre();

        // Get the GitHub Owner/Repository.
        let ownerRepository = await getOwnerRepository() as string;
        if (!ownerRepository) { return; }

        // Get the GitHub Branch.
        let branch = await getBranch({ownerRepository: ownerRepository}) as string;
        if (!branch) { return; }

        // Get the GitHub File.
        let file = await getFile({ ownerRepository: ownerRepository, branch: branch }) as string;
        if (!file) { return; }

        // Get the destination workspace folder.
        let workspaceFolder = await getWorkspaceFolder() as string;
        if (!workspaceFolder) { return; }

        // Get the destination file path.
        let destination = await getDestination({ file: file, workspaceFolder: workspaceFolder });
        if (!destination) { return; }

        let destinationFile = destination.destinationFile;
        let destinationFilePath = destination.destinationFilePath;

        // Fetch the file content.
        let fileContent = await fetchFile({ ownerRepository: ownerRepository, file: file, branch: branch, }) as unknown as string;
        if (!fileContent) { return; }

        // Add the file to the workspace folder.
        await addFile({ destinationFilePath: destinationFilePath, fileContent: fileContent });

        // Add new repository to settings.
        await addNewRepoToSetting({ ownerRepository: ownerRepository });

        // Add the workspace folders.
        await setWorkspaceFolders(context, { workspaceFolder: workspaceFolder, destinationFile: destinationFile, ownerRepository: ownerRepository, branch: branch, file: file });
    }
}

/**
 * Performs pre-processing tasks before fetching files from GitHub.
 * Checks if a workspace folder is available and adds the search repository and owner to the repositories list if they are not already included.
 */
function pre() {

    // Return if no workspaceFolder is available
    if (!vscode.workspace.workspaceFolders) {
        vscode.window.showWarningMessage(`GitHubFileFetcher: No Workspace Folder is available. Please open a folder before.`);
        vscode.commands.executeCommand('workbench.action.addRootFolder');
        return;
    }

    if (!repositories.includes(searchRepoString)) {
        repositories.unshift(searchRepoString);
    }

    if (!repositories.includes(searchOwnerString)) {
        repositories.unshift(searchOwnerString);
    }
}

/**
* Listen for configuration change in `gitHubFileFetcher.history` or `gitHubFileFetcher.checkForUpdates` section
* When anything changes in the section, show a prompt to reload
* VSCode window via `workbench.action.reloadWindow` command
*/
function handleConfigChange() {
    vscode.workspace.onDidChangeConfiguration(configChangeEvent => {

        if (configChangeEvent.affectsConfiguration('gitHubFileFetcher.history') || configChangeEvent.affectsConfiguration('gitHubFileFetcher.checkForUpdates')) {
        const actions = ['Reload now', 'Later'];

        vscode.window.showInformationMessage('The VSCode window needs to reload for the changes to take effect. Would you like to reload the window now?', ...actions)
            .then(action => {

                if (action === actions[0]) {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            });
        }
    });
}

/**
 * Retrieves the options for making API requests to GitHub.
 *
 * @returns The options object containing the necessary headers for authentication.
 */
function getOptions() {

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

    return options;
}

/**
 * Retrieves the owner and repository name from the user through a series of prompts and returns the selected repository.
 * If the user chooses to search for repositories, it makes an API call to fetch the repositories and allows the user to select one.
 * @returns The selected owner and repository name.
 */
async function getOwnerRepository() {

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

        if (config.informationMessages === 'verbose') {
            vscode.window.showInformationMessage(`GitHubFileFetcher: Fetching ${value} from url: "${url}".`);
        }

        let response = await fetch(url, options);
        let json: any = await response.json();

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

/**
 * Fetches the branches from a GitHub repository and allows the user to select a branch.
 * @param data - An object containing the owner and repository name.
 * @returns A Promise that resolves to the selected branch.
 */
async function getBranch(data: { ownerRepository: any; }) {

    // Create Branch Selection.
    let url = `https://api.github.com/repos/${data.ownerRepository}/branches`;
    if (config.informationMessages === 'verbose') {
        vscode.window.showInformationMessage(`GitHubFileFetcher (2/6): Fetching branches from "${url}".`);
    }

    let response = await fetch(url, options);
    let json: any = await response.json();
    let branches: string[] = [];

    if (json.message) {
        vscode.window.showErrorMessage(`GitHubFileFetcher: ${json.message}.`);
        return;
    }

    Object.keys(json).forEach(function (key) {
        branches.push(json[key].name);
    });

    let branch = await vscode.window.showQuickPick(branches.reverse(), {
        title: 'GitHubFileFetcher (2/6)',
        placeHolder: 'GitHubFileFetcher: Select branch...',
        canPickMany: false,
    });

    return branch;
}

/**
 * Fetches files from a GitHub repository based on the provided owner, repository, and branch.
 * @param data - An object containing the ownerRepository and branch information.
 * @returns A Promise that resolves to the selected file path or undefined if no file is selected.
 */
async function getFile(data: { ownerRepository: any; branch: any; }) {

    // Get all possible files.
    let url = `https://api.github.com/repos/${data.ownerRepository}/git/trees/${data.branch}?recursive=1`;

    if (config.informationMessages === 'verbose') {
        vscode.window.showInformationMessage(`GitHubFileFetcher (3/6): Fetching files from "${url}".`);
    }

    let response = await fetch(url, options);
    let json: any = await response.json();
    let files: string[] = [];

    if (json.message) {
        vscode.window.showErrorMessage(`GitHubFileFetcher (3/6): ${json.message}.`);
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

/**
 * Retrieves the selected workspace folder from the user.
 *
 * @returns A Promise that resolves to the selected workspace folder path, or undefined if no workspace folder is selected.
 */
async function getWorkspaceFolder() {

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
        vscode.window.showErrorMessage(`GitHubFileFetcher (4/6): No Workspace Folder exists.`);
        return;
    }

    return workspaceFolder;
}

/**
 * Retrieves the destination file path and checks if it already exists.
 * If the file already exists, it prompts the user to confirm overwriting.
 * If the file does not exist or the user chooses not to overwrite, it prompts for a new destination file path.
 * @param data - An object containing the file and workspace folder information.
 * @returns An object with the destination file name and path.
 */
async function getDestination(data: { file: any; workspaceFolder: any; }) {

    let destinationFile = await vscode.window.showInputBox({
        title: 'GitHubFileFetcher (5/6)',
        placeHolder: `GitHubFileFetcher: Enter or change destination file path...`,
        value: data.file,
        prompt: `GitHubFileFetcher: Enter or change destination file path...`,
    }) as string;

    let destinationFilePath = vscode.Uri.file(data.workspaceFolder + '/' + destinationFile);

    let overwriteExistingFile = false;
    try {
        await vscode.workspace.fs.stat(destinationFilePath);

        let confirmOverwrite = await vscode.window.showQuickPick(['yes', 'no'], {
            title: 'GitHubFileFetcher (Overwrite)',
            placeHolder: 'GitHubFileFetcher: Destination file already exists. Overwrite?',
            canPickMany: false,
        });
        if (confirmOverwrite === 'yes') {
            overwriteExistingFile = true;
        }
    } catch (error) {
        if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
            // File does not exist, continue without overwriting
        } else {
            // Re-throw the error if it's not a FileNotFound error
            throw error;
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
                value: data.file,
                prompt: `GitHubFileFetcher: Enter or change destination file path...`,
            }) as string;
            destinationFilePath = vscode.Uri.file(data.workspaceFolder + '/' + destinationFile);
        }
    }

    if (!destinationFilePath) {
        vscode.window.showErrorMessage(`GitHubFileFetcher (5/6): No filePath exists.`);
        return;
    }

    return {
        destinationFile: destinationFile,
        destinationFilePath: destinationFilePath,
    };
}

/**
 * Fetches a file from a GitHub repository.
 * @param data - An object containing the owner and repository name, file path, and branch name.
 * @returns A Promise that resolves to the file content as a Uint8Array.
 */
async function fetchFile(data: { ownerRepository: any; file: any; branch: any; }) {

// Get file data.
    let url = `https://api.github.com/repos/${data.ownerRepository}/contents/${data.file}?ref=${data.branch}`;

    if (config.informationMessages === 'verbose') {
        vscode.window.showInformationMessage(`GitHubFileFetcher (6/6): Fetching file data for file: "${data.file}" from branch: "${data.branch}" from url: "${url}".`);
    }

    let response = await fetch(url, options);
    let json: any = await response.json();
    if (json.message) {
        vscode.window.showErrorMessage(`GitHubFileFetcher (6/6): ${json.message}.`);
        return;
    }

    const writeBytes = toUint8Array(json.content);
    let fileContent = new Uint8Array(writeBytes);

    if (!fileContent) {
        vscode.window.showErrorMessage(`GitHubFileFetcher (6/6): No file content exists.`);
        return;
    }

    if (config.informationMessages === 'verbose') {
        vscode.window.showInformationMessage(`GitHubFileFetcher (6/6): Decoded file: "${data.file}" from branch: "${data.branch}".`);
    }

    return fileContent;
}

/**
 * Adds a file to the specified destination path with the given content.
 * @param data - An object containing the destination file path and the content of the file.
 */
async function addFile(data: { destinationFilePath: any; fileContent: any; }) {
    try {
        await vscode.workspace.fs.writeFile(data.destinationFilePath, data.fileContent);
    } catch (err) {
        console.error(err);
        vscode.window.showErrorMessage(`GitHubFileFetcher (6/6): ${err}.`);
    }
}

/**
 * Retrieves the latest commit ID for a specific file in a GitHub repository.
 *
 * @param context - The extension context.
 * @returns The latest commit ID.
 */
async function getLatestCommitId(data: { ownerRepository: any; branch: any; file: any; }) {

    // Get commits
    let url = `https://api.github.com/repos/${data.ownerRepository}/commits?path=${data.file};sha=${data.branch}`;
    let response = await fetch(url, options);

    let commits: any[] = await response.json() as any[];
    if (!commits) { return; }

    let latestCommitId: string = commits[0].sha;
    return latestCommitId;
}

/**
 * Adds a new repository to the settings if the user chooses to save it.
 * @param data - The data containing the owner and repository information.
 */
async function addNewRepoToSetting(data: { ownerRepository: any }) {

    if (!newRepoFound) { return; }

    let addNewRepoToSetting = await vscode.window.showQuickPick(['yes', 'no'], {
        title: 'GitHubFileFetcher (New Repository)',
        placeHolder: 'GitHubFileFetcher: Should I save the new repository in the settings?',
        canPickMany: false,
    });

    if (addNewRepoToSetting === 'yes') {

        let configRepositories = config.repositories;
        configRepositories.push(data.ownerRepository);

        await vscode.workspace.getConfiguration().update('gitHubFileFetcher.repositories', configRepositories, true);
    }
}

/**
 * Stores the workspace folders.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<void>} - A promise that resolves when the workspace folders are stored.
 */
async function setWorkspaceFolders(context: vscode.ExtensionContext, data: any) {

    if (!config.history) { return; }
    let workspaceFolders: any = await getWorkspaceFolders(context);

    if (!workspaceFolders) {
        workspaceFolders = {};
    }

    let workspaceFolder = data.workspaceFolder;
    let destinationFile = data.destinationFile;
    let ownerRepository = data.ownerRepository;
    let branch = data.branch;
    let file = data.file;

    let latestCommitId = await getLatestCommitId({ ownerRepository: ownerRepository, branch: branch, file: file, });

    workspaceFolders[workspaceFolder] = workspaceFolders[workspaceFolder] || {};
    workspaceFolders[workspaceFolder][destinationFile] = workspaceFolders[workspaceFolder][destinationFile] || {};

    workspaceFolders[workspaceFolder][destinationFile]['ownerRepository'] = ownerRepository;
    workspaceFolders[workspaceFolder][destinationFile]['branch'] = branch;
    workspaceFolders[workspaceFolder][destinationFile]['file'] = file;
    workspaceFolders[workspaceFolder][destinationFile]['commitId'] = latestCommitId;
    workspaceFolders[workspaceFolder][destinationFile]['timestamp'] = new Date().toISOString();

    await context.globalState.update('gitHubFileFetcher.workspaceFolders', JSON.stringify(workspaceFolders));
}

/**
 * Retrieves the stored workspace folders.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<any>} - A promise that resolves to the stored workspace folders.
 */
async function getWorkspaceFolders(context: vscode.ExtensionContext) {

    let workspaceFoldersJson: any = await context.globalState.get('gitHubFileFetcher.workspaceFolders') || '{}';
    let workspaceFolders = JSON.parse(workspaceFoldersJson);

    return workspaceFolders;
}

/**
 * Checks for updates and displays a warning message
 * if the current active file is not up to date.
 *
 * @param context - The extension context.
 */
async function checkForUpdates(context: vscode.ExtensionContext) {

    let workspaceFolders = await getWorkspaceFolders(context);
    if (!workspaceFolders) { return; }

    options = getOptions();

    let activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {

        let workspaceFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri)?.uri.fsPath;
        let filePath = activeEditor.document.uri.fsPath;
        let relativePath = vscode.workspace.asRelativePath(filePath);

        if (!relativePath) { return; }

        if (workspaceFolder && workspaceFolders[workspaceFolder] && workspaceFolders[workspaceFolder][relativePath]) {

            let ownerRepository = workspaceFolders[workspaceFolder][relativePath].ownerRepository;
            let branch = workspaceFolders[workspaceFolder][relativePath].branch;
            let file = workspaceFolders[workspaceFolder][relativePath].file;

            let commitId = workspaceFolders[workspaceFolder][relativePath].commitId;
            let latestCommitId = await getLatestCommitId({ ownerRepository: ownerRepository, branch: branch, file: file });

            let shortCommitId = commitId.substring(0, 7);
            let shortLatestCommitId = latestCommitId?.substring(0, 7) ?? '';

            if (latestCommitId && commitId && latestCommitId !== commitId) {
                vscode.window.showWarningMessage(`GitHubFileFetcher: File is not up to date. | File: ${file} | Owner/Repository: ${ownerRepository} | Branch: ${branch} | Fetched CommitID: ${shortCommitId}. | Latest CommitID: ${shortLatestCommitId}`);
            }
            else {
                if (config.checkForUpdatesMessages === 'verbose') {
                    vscode.window.showInformationMessage(`GitHubFileFetcher: File is up to date. | File: ${file} | Owner/Repository: ${ownerRepository} | Branch: ${branch} | Fetched CommitID: ${shortCommitId}. | Latest CommitID: ${shortLatestCommitId}`);
                }
            }
        }

    } else {
        // TODO: Show stored Workspace Folders
        console.log("No active editor");
    }
}

// This method is called when your extension is deactivated.
export function deactivate() { }
