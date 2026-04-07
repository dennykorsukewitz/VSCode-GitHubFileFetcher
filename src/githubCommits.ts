/**
 * Latest commit SHA for a path on a branch (same endpoint shape as the main fetcher).
 */
export async function fetchLatestCommitSha(
    ownerRepository: string,
    branch: string,
    filePath: string,
    fetchOptions: RequestInit,
): Promise<string | undefined> {

    let url = `https://api.github.com/repos/${ownerRepository}/commits?path=${filePath};sha=${branch}`;
    let response = await fetch(url, fetchOptions);
    let commits: unknown = await response.json();

    if (!Array.isArray(commits) || commits.length === 0) {
        return undefined;
    }

    let first = commits[0] as { sha?: string };
    return typeof first.sha === 'string' ? first.sha : undefined;
}
