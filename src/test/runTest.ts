import * as path from 'path';
import {
    downloadAndUnzipVSCode,
    resolveCliPathFromVSCodeExecutablePath,
    runTests,
} from '@vscode/test-electron';

async function main(): Promise<void> {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');
        const extensionTestsPath = path.resolve(__dirname, './suite/index');
        const vscodeExecutablePath = await downloadAndUnzipVSCode({
            extensionDevelopmentPath,
        });
        // runTests() spawns this path with CLI flags; on macOS the downloaded
        // path points at Electron, which rejects those args — use the code CLI.
        const launchExecutable = resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath);
        await runTests({
            vscodeExecutablePath: launchExecutable,
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: ['--disable-extensions'],
        });
    } catch (err) {
        console.error('Failed to run tests', err);
        process.exit(1);
    }
}

void main();
