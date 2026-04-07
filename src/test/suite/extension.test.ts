import * as assert from 'assert';
import * as vscode from 'vscode';

let EXT_ID = 'GitHubFileFetcher';

suite('GitHubFileFetcher extension', () => {
    test('Extension is installed for this test run', () => {
        let ext = vscode.extensions.all.find((e) => e.packageJSON.name === EXT_ID);
        assert.ok(ext, `Expected ${EXT_ID} in development host`);
    });

    test('Extension activates without throwing', async () => {
        let ext = vscode.extensions.all.find((e) => e.packageJSON.name === EXT_ID);
        assert.ok(ext);
        await ext.activate();
    });

    test('Commands are registered after activation', async () => {
        let ext = vscode.extensions.all.find((e) => e.packageJSON.name === EXT_ID);
        assert.ok(ext);
        await ext.activate();

        let commands = await vscode.commands.getCommands(true);
        let expected = [
            'gitHubFileFetcher.run',
            'gitHubFileFetcher.checkForUpdates',
            'gitHubFileFetcher.fetchHistory.show',
            'gitHubFileFetcher.fetchHistory.clear',
            'gitHubFileFetcher.fetchHistory.add',
            'gitHubFileFetcher.fetchHistory.refresh',
            'gitHubFileFetcher.fetchHistory.removeFile',
            'gitHubFileFetcher.fetchHistory.removeWorkspace',
            'gitHubFileFetcher.fetchHistory.removeMissing',
        ];
        for (let id of expected) {
            assert.ok(commands.includes(id), `${id} should be registered`);
        }
    });

    test('gitHubFileFetcher configuration is readable', async () => {
        let ext = vscode.extensions.all.find((e) => e.packageJSON.name === EXT_ID);
        assert.ok(ext);
        await ext.activate();

        let cfg = vscode.workspace.getConfiguration('gitHubFileFetcher');
        let fetchHistory = cfg.get<boolean>('fetchHistory');
        assert.ok(typeof fetchHistory === 'boolean', 'fetchHistory should be boolean');

        let checkForUpdates = cfg.get<boolean>('checkForUpdates');
        assert.ok(typeof checkForUpdates === 'boolean', 'checkForUpdates should be boolean');

        let hintSeconds = cfg.get<number>('checkForUpdatesHintSeconds');
        assert.ok(
            typeof hintSeconds === 'number' && hintSeconds >= 0,
            'checkForUpdatesHintSeconds should be a non-negative number',
        );

        let repos = cfg.get<string[]>('repositories');
        assert.ok(Array.isArray(repos), 'repositories should be an array');
    });
});
