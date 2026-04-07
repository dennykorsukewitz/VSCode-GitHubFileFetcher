import * as path from 'path';
import * as vscode from 'vscode';
import { fetchLatestCommitSha } from './githubCommits';

const GLOBAL_STATE_KEY = 'gitHubFileFetcher.workspaceFolders';

export type FetchHistoryFileEntry = {
    ownerRepository: string;
    branch: string;
    file: string;
    commitId: string;
    timestamp: string;
};

export type FetchHistoryStore = Record<string, Record<string, FetchHistoryFileEntry>>;

export type FileSyncStatus = 'sync' | 'behind' | 'missing' | 'unknown' ;

let treeProviderInstance: FetchHistoryTreeProvider | undefined;

export function refreshFetchHistoryTree() {
    treeProviderInstance?.refresh();
}

export class FetchHistoryTreeItem extends vscode.TreeItem {

    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly nodeKind: 'workspace' | 'file' | 'detail',
        public readonly workspaceFsPath: string,
        public readonly relativePath?: string,
        fileSyncStatus?: FileSyncStatus,
    ) {
        super(label, collapsibleState);
        if (nodeKind === 'workspace') {
            this.contextValue = 'fetchHistoryWorkspace';
            if (fileSyncStatus === 'sync') {
                this.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor('charts.green'));
            }
            else if (fileSyncStatus === 'missing') {
                this.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor('charts.yellow'));
            }
            else if (fileSyncStatus === 'behind' || fileSyncStatus === 'unknown') {
                this.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor('charts.red'));
            }
            else {
                this.iconPath = new vscode.ThemeIcon('folder');
            }
            this.tooltip = workspaceFsPath;
        }
        else if (nodeKind === 'file') {
            this.contextValue = 'fetchHistoryFile';
            this.resourceUri = vscode.Uri.file(path.join(workspaceFsPath, relativePath ?? ''));
            if (fileSyncStatus !== 'missing') {
                this.command = {
                    command: 'vscode.open',
                    title: 'Open File',
                    arguments: [vscode.Uri.file(path.join(workspaceFsPath, relativePath ?? ''))],
                };
            }
            if (fileSyncStatus === 'sync') {
                this.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('charts.green'));
                this.description = 'Up to date';
            }
            else if (fileSyncStatus === 'behind') {
                this.iconPath = new vscode.ThemeIcon('cloud-download', new vscode.ThemeColor('charts.red'));
                this.description = 'Out of date';
            }
            else if (fileSyncStatus === 'missing') {
                this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'));
                this.description = 'File not found';
            }
            else {
                this.iconPath = new vscode.ThemeIcon('file');
                this.description = 'Unknown status';
            }
        }
        else {
            this.contextValue = 'fetchHistoryDetail';
            this.iconPath = new vscode.ThemeIcon('symbol-string');
        }
    }
}

export class FetchHistoryTreeProvider implements vscode.TreeDataProvider<FetchHistoryTreeItem> {

    private _onDidChangeTreeData = new vscode.EventEmitter<FetchHistoryTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private fileStatusCache = new Map<string, FileSyncStatus>();

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly getFetchOptions: () => RequestInit,
    ) {
        treeProviderInstance = this;
    }

    refresh() {
        this.fileStatusCache.clear();
        this._onDidChangeTreeData.fire();
    }

    dispose() {
        if (treeProviderInstance === this) {
            treeProviderInstance = undefined;
        }
        this._onDidChangeTreeData.dispose();
    }

    getTreeItem(element: FetchHistoryTreeItem): vscode.TreeItem {
        return element;
    }

    private cacheKey(workspaceFsPath: string, relativePath: string) {
        return `${workspaceFsPath}\n${relativePath}`;
    }

    private async resolveFileStatus(
        workspaceFsPath: string,
        relativePath: string,
        entry: FetchHistoryFileEntry,
        fetchOptions: RequestInit,
    ): Promise<FileSyncStatus> {

        let uri = vscode.Uri.file(path.join(workspaceFsPath, relativePath));
        try {
            await vscode.workspace.fs.stat(uri);
        } catch {
            return 'missing';
        }

        let latest = await fetchLatestCommitSha(entry.ownerRepository, entry.branch, entry.file, fetchOptions);
        if (!latest || !entry.commitId) {
            return 'unknown';
        }
        if (latest.toLowerCase() === entry.commitId.toLowerCase()) {
            return 'sync';
        }
        return 'behind';
    }

    /**
     * Roll-up: all sync → green; any behind → red; else any missing → yellow; else any unknown → red-tinted; else sync.
     */
    private async resolveWorkspaceAggregateStatus(
        workspaceFsPath: string,
        files: Record<string, FetchHistoryFileEntry>,
        fetchOptions: RequestInit,
    ): Promise<FileSyncStatus | undefined> {

        let relPaths = Object.keys(files);
        if (!relPaths.length) {
            return undefined;
        }
        let anyBehind = false;
        let anyMissing = false;
        let anyUnknown = false;
        for (let rel of relPaths) {
            let entry = files[rel];
            let key = this.cacheKey(workspaceFsPath, rel);
            let status = this.fileStatusCache.get(key);
            if (status === undefined) {
                status = await this.resolveFileStatus(workspaceFsPath, rel, entry, fetchOptions);
                this.fileStatusCache.set(key, status);
            }
            if (status === 'behind') {
                anyBehind = true;
            }
            if (status === 'missing') {
                anyMissing = true;
            }
            if (status === 'unknown') {
                anyUnknown = true;
            }
        }
        if (anyBehind) {
            return 'behind';
        }
        if (anyMissing) {
            return 'missing';
        }
        if (anyUnknown) {
            return 'unknown';
        }
        return 'sync';
    }

    async getChildren(element?: FetchHistoryTreeItem): Promise<FetchHistoryTreeItem[]> {

        let store: FetchHistoryStore;
        try {
            store = await readHistory(this.context);
        } catch {
            return [];
        }

        if (!store || typeof store !== 'object') {
            return [];
        }

        if (!element) {
            let roots = Object.keys(store).sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
            let fetchOptions = this.getFetchOptions();
            let items: FetchHistoryTreeItem[] = [];
            for (let ws of roots) {
                let name = path.basename(ws) || ws;
                let files = store[ws] || {};
                let count = Object.keys(files).length;
                let aggregate = await this.resolveWorkspaceAggregateStatus(ws, files, fetchOptions);
                let item = new FetchHistoryTreeItem(
                    count ? `${name} (${count})` : name,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'workspace',
                    ws,
                    undefined,
                    aggregate,
                );
                item.description = ws;
                if (aggregate === 'sync') {
                    let tip = new vscode.MarkdownString(undefined, true);
                    tip.appendMarkdown(`**${name}**\n\n`);
                    tip.appendMarkdown(`- **Path:** \`${ws}\`\n`);
                    tip.appendMarkdown(`- **Workspace status:** All ${count} entr${count === 1 ? 'y is' : 'ies are'} up to date with GitHub.\n`);
                    item.tooltip = tip;
                }
                else if (aggregate === 'behind') {
                    let tip = new vscode.MarkdownString(undefined, true);
                    tip.appendMarkdown(`**${name}**\n\n`);
                    tip.appendMarkdown(`- **Path:** \`${ws}\`\n`);
                    tip.appendMarkdown(`- **Workspace status:** At least one file is **out of date** (newer commit on GitHub).\n`);
                    item.tooltip = tip;
                }
                else if (aggregate === 'missing') {
                    let tip = new vscode.MarkdownString(undefined, true);
                    tip.appendMarkdown(`**${name}**\n\n`);
                    tip.appendMarkdown(`- **Path:** \`${ws}\`\n`);
                    tip.appendMarkdown(`- **Workspace status:** At least one file path **no longer exists** on disk. Use **Remove Missing Files from Fetch History** from the view toolbar or Command Palette.\n`);
                    item.tooltip = tip;
                }
                else if (aggregate === 'unknown') {
                    let tip = new vscode.MarkdownString(undefined, true);
                    tip.appendMarkdown(`**${name}**\n\n`);
                    tip.appendMarkdown(`- **Path:** \`${ws}\`\n`);
                    tip.appendMarkdown(`- **Workspace status:** At least one file could not be verified (API, rate limit, or network).\n`);
                    item.tooltip = tip;
                }
                items.push(item);
            }
            return items;
        }

        if (element.nodeKind === 'workspace') {
            let files = store[element.workspaceFsPath];
            if (!files) {
                return [];
            }
            let keys = Object.keys(files).sort();
            let fetchOptions = this.getFetchOptions();
            let items: FetchHistoryTreeItem[] = [];
            for (let rel of keys) {
                let entry = files[rel];
                let key = this.cacheKey(element.workspaceFsPath, rel);
                let status = this.fileStatusCache.get(key);
                if (status === undefined) {
                    status = await this.resolveFileStatus(element.workspaceFsPath, rel, entry, fetchOptions);
                    this.fileStatusCache.set(key, status);
                }
                let item = new FetchHistoryTreeItem(
                    rel,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'file',
                    element.workspaceFsPath,
                    rel,
                    status,
                );
                let tip = new vscode.MarkdownString(undefined, true);
                tip.appendMarkdown(`**${rel}**\n\n`);
                tip.appendMarkdown(`- **GitHub:** \`${entry.ownerRepository}\` · \`${entry.branch}\`\n`);
                tip.appendMarkdown(`- **Stored commit:** \`${entry.commitId ? entry.commitId.substring(0, 7) : '—'}\`\n`);
                if (status === 'sync') {
                    tip.appendMarkdown(`- **Status:** Up to date (matches latest commit for this path)\n`);
                }
                else if (status === 'behind') {
                    tip.appendMarkdown(`- **Status:** Out of date (newer commit on GitHub)\n`);
                }
                else if (status === 'missing') {
                    tip.appendMarkdown(`- **Status:** File not found at workspace path (removed locally or moved)\n`);
                }
                else {
                    tip.appendMarkdown(`- **Status:** Unknown (API, rate limit, or network)\n`);
                }
                item.tooltip = tip;
                items.push(item);
            }
            return items;
        }

        if (element.nodeKind === 'file') {
            let entry = store[element.workspaceFsPath]?.[element.relativePath ?? ''];
            if (!entry) {
                return [];
            }
            let shortCommit = entry.commitId ? entry.commitId.substring(0, 7) : '';
            let rows: { key: string; value: string; tip?: string }[] = [
                { key: 'Repository', value: entry.ownerRepository },
                { key: 'Branch', value: entry.branch },
                { key: 'File (GitHub)', value: entry.file },
                { key: 'Commit', value: shortCommit || entry.commitId, tip: entry.commitId },
                { key: 'Fetched (UTC)', value: entry.timestamp },
            ];
            return rows.map((row) => {
                let leaf = new FetchHistoryTreeItem(
                    `${row.key}: ${row.value}`,
                    vscode.TreeItemCollapsibleState.None,
                    'detail',
                    element.workspaceFsPath,
                    element.relativePath,
                );
                leaf.tooltip = row.tip ?? row.value;
                return leaf;
            });
        }

        return [];
    }
}

async function readHistory(context: vscode.ExtensionContext): Promise<FetchHistoryStore> {
    let raw = await context.globalState.get<string>(GLOBAL_STATE_KEY) || '{}';
    let parsed = JSON.parse(raw) as FetchHistoryStore;
    if (!parsed || typeof parsed !== 'object') {
        return {};
    }
    return parsed;
}

async function writeHistory(context: vscode.ExtensionContext, data: FetchHistoryStore) {
    await context.globalState.update(GLOBAL_STATE_KEY, JSON.stringify(data));
}

export async function removeFetchHistoryFileEntry(
    context: vscode.ExtensionContext,
    workspaceFsPath: string,
    relativePath: string,
) {

    let store = await readHistory(context);
    if (!store[workspaceFsPath]?.[relativePath]) {
        return;
    }
    delete store[workspaceFsPath][relativePath];
    if (Object.keys(store[workspaceFsPath]).length === 0) {
        delete store[workspaceFsPath];
    }
    await writeHistory(context, store);
    refreshFetchHistoryTree();
}

export async function removeFetchHistoryWorkspace(
    context: vscode.ExtensionContext,
    workspaceFsPath: string,
) {

    let store = await readHistory(context);
    if (!store[workspaceFsPath]) {
        return;
    }
    delete store[workspaceFsPath];
    await writeHistory(context, store);
    refreshFetchHistoryTree();
}

type MissingHistoryRef = { workspaceFsPath: string; relativePath: string };

export async function promptRemoveMissingFromFetchHistory(context: vscode.ExtensionContext) {

    let store = await readHistory(context);
    let missing: MissingHistoryRef[] = [];
    for (let ws of Object.keys(store)) {
        for (let rel of Object.keys(store[ws] || {})) {
            let uri = vscode.Uri.file(path.join(ws, rel));
            try {
                await vscode.workspace.fs.stat(uri);
            } catch {
                missing.push({ workspaceFsPath: ws, relativePath: rel });
            }
        }
    }
    if (missing.length === 0) {
        await vscode.window.showInformationMessage('No fetch history entries reference files that are missing on disk.');
        return;
    }
    let choice = await vscode.window.showInformationMessage(
        `Found ${missing.length} fetch history ${missing.length === 1 ? 'entry' : 'entries'} for files that are not on disk. How do you want to delete them from storage?`,
        { modal: true },
        'Remove all',
        'One by one',
    );
    if (choice === 'Remove all') {
        let next = await readHistory(context);
        for (let m of missing) {
            if (next[m.workspaceFsPath]?.[m.relativePath]) {
                delete next[m.workspaceFsPath][m.relativePath];
                if (Object.keys(next[m.workspaceFsPath]).length === 0) {
                    delete next[m.workspaceFsPath];
                }
            }
        }
        await writeHistory(context, next);
        refreshFetchHistoryTree();
        await vscode.window.showInformationMessage(
            `Removed ${missing.length} ${missing.length === 1 ? 'entry' : 'entries'} from fetch history.`,
        );
        return;
    }
    if (choice === 'One by one') {
        let removed = 0;
        for (let m of missing) {
            let wsLabel = path.basename(m.workspaceFsPath) || m.workspaceFsPath;
            let pick = await vscode.window.showWarningMessage(
                `Remove fetch history for the missing file "${m.relativePath}" (workspace folder: "${wsLabel}")?`,
                { modal: true },
                'Remove',
                'Skip',
            );
            if (pick === 'Remove') {
                await removeFetchHistoryFileEntry(context, m.workspaceFsPath, m.relativePath);
                removed++;
            }
        }
        if (removed > 0) {
            await vscode.window.showInformationMessage(`Removed ${removed} ${removed === 1 ? 'entry' : 'entries'} from fetch history.`);
        }
        return;
    }
}

export function createFetchHistoryTreeView(
    context: vscode.ExtensionContext,
    getFetchOptions: () => RequestInit,
): vscode.TreeView<FetchHistoryTreeItem> {

    let provider = new FetchHistoryTreeProvider(context, getFetchOptions);
    let view = vscode.window.createTreeView('gitHubFileFetcher.fetchHistory', {
        treeDataProvider: provider,
        showCollapseAll: true,
    });

    context.subscriptions.push(
        view,
        { dispose: () => provider.dispose() },
        vscode.commands.registerCommand('gitHubFileFetcher.fetchHistory.add', () => vscode.commands.executeCommand('gitHubFileFetcher.run')),
        vscode.commands.registerCommand('gitHubFileFetcher.fetchHistory.refresh', () => provider.refresh()),
        vscode.commands.registerCommand('gitHubFileFetcher.fetchHistory.removeMissing', () => promptRemoveMissingFromFetchHistory(context)),
        vscode.commands.registerCommand('gitHubFileFetcher.fetchHistory.removeFile', async (item: FetchHistoryTreeItem) => {
            if (!item || item.nodeKind !== 'file' || !item.relativePath) {
                return;
            }
            let wsLabel = path.basename(item.workspaceFsPath) || item.workspaceFsPath;
            let ok = await vscode.window.showWarningMessage(
                `Remove global fetch history for "${item.relativePath}" (workspace folder: "${wsLabel}")? Storage is extension-wide; only this entry is deleted. "Check for updates" will ignore it until you fetch again.`,
                { modal: true },
                'Remove',
            );
            if (ok !== 'Remove') {
                return;
            }
            await removeFetchHistoryFileEntry(context, item.workspaceFsPath, item.relativePath);
        }),
        vscode.commands.registerCommand('gitHubFileFetcher.fetchHistory.removeWorkspace', async (item: FetchHistoryTreeItem) => {
            if (!item || item.nodeKind !== 'workspace') {
                return;
            }
            let name = path.basename(item.workspaceFsPath) || item.workspaceFsPath;
            let ok = await vscode.window.showWarningMessage(
                `Remove all global fetch history entries for workspace folder "${name}"? Other workspace folders in storage are left unchanged. This cannot be undone.`,
                { modal: true },
                'Remove all',
            );
            if (ok !== 'Remove all') {
                return;
            }
            await removeFetchHistoryWorkspace(context, item.workspaceFsPath);
        }),
    );

    return view;
}
