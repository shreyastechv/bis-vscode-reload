import * as childProcess from 'child_process';
import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as util from 'util';
import * as vscode from 'vscode';

const MAIN_APP_PATH = '/var/www/bistrainer/app';
const WORKTREE_BASE_PATH = '/var/www/bistrainer/app-worktrees/';
const MAIN_APP_HOST = 'bisdev.local.com';
const RELOAD_PATH = '/v1/index.cfm?action=store.TicketVerification&reload=1';

let lastTriggeredAt = 0;
let isReloading = false;
let statusBar: vscode.StatusBarItem;
let activeReloadRequest: http.ClientRequest | undefined;
let stopReloadRequested = false;
const documentHashes = new Map<string, string>();
const execFile = util.promisify(childProcess.execFile);

export function activate(context: vscode.ExtensionContext) {
  for (const document of vscode.workspace.textDocuments) {
    rememberDocumentHash(document);
  }

  const saveDisposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
    if (!document.fileName.endsWith('.cfc')) {
      return;
    }

    const config = vscode.workspace.getConfiguration('bisReload');
    const autoReload = config.get<boolean>('autoReload', true);

    if (!autoReload) {
      return;
    }

    const shouldReload = await hasReloadableChange(document);
    rememberDocumentHash(document);

    if (!shouldReload) {
      return;
    }

    await triggerReload('auto', document.fileName);
  });

  const openDisposable = vscode.workspace.onDidOpenTextDocument((document) => {
    rememberDocumentHash(document);
  });

  // Manual command
  const commandDisposable = vscode.commands.registerCommand(
    'bisReload.triggerReload',
    async () => {
      await triggerReload(
        'manual',
        vscode.window.activeTextEditor?.document.fileName
      );
    }
  );

  const stopCommandDisposable = vscode.commands.registerCommand(
    'bisReload.stopReload',
    stopReload
  );

  // Status bar
  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left
  );

  context.subscriptions.push(
    saveDisposable,
    openDisposable,
    commandDisposable,
    stopCommandDisposable,
    statusBar
  );
}

async function triggerReload(source: 'auto' | 'manual' = 'auto', fileName?: string) {
  const config = vscode.workspace.getConfiguration('bisReload');
  const cooldownMs = config.get<number>('cooldownMs', 5000);
  const reloadUrl = resolveReloadUrl(fileName);

  if (isReloading) {
    if (source === 'manual') {
      vscode.window.showWarningMessage(
        'Reload already in progress. Click the reloading section in the Status Bar to stop reloading'
      );
    }
    return;
  }

  const now = Date.now();
  if (source === 'auto' && now - lastTriggeredAt < cooldownMs) {
    return;
  }

  statusBar.text = '$(sync~spin) Reloading BIS...';
  statusBar.tooltip = `Reload URL: ${reloadUrl}\nClick to stop reloading`;
  statusBar.command = 'bisReload.stopReload';
  statusBar.show();

  lastTriggeredAt = now;
  isReloading = true;
  stopReloadRequested = false;

  try {
    const result = await callUrlAndCheck(reloadUrl);
    if (result === 'success') {
      showSuccessNotification(source);
    } else if (result === 'failure') {
      showFailureNotification();
    }
  } finally {
    isReloading = false;
    statusBar.tooltip = undefined;
    statusBar.command = undefined;
    statusBar.hide();
  }
}

export function deactivate() {}

function stopReload() {
  if (!isReloading || !activeReloadRequest) {
    return;
  }

  stopReloadRequested = true;
  activeReloadRequest.destroy();
}

async function hasReloadableChange(document: vscode.TextDocument): Promise<boolean> {
  const gitStatus = await getGitFileStatus(document.fileName);

  if (gitStatus === 'changed') {
    return true;
  }

  if (hasSessionChange(document)) {
    return true;
  }

  return gitStatus === 'not-git';
}

async function getGitFileStatus(fileName: string): Promise<'changed' | 'unchanged' | 'not-git'> {
  const cwd = path.dirname(fileName);

  try {
    const { stdout: insideWorkTree } = await execFile(
      'git',
      ['-C', cwd, 'rev-parse', '--is-inside-work-tree'],
      { timeout: 5000 }
    );

    if (insideWorkTree.trim() !== 'true') {
      return 'not-git';
    }

    const { stdout } = await execFile(
      'git',
      ['-C', cwd, 'status', '--porcelain', '--', fileName],
      { timeout: 5000 }
    );

    return stdout.trim() ? 'changed' : 'unchanged';
  } catch {
    return 'not-git';
  }
}

function hasSessionChange(document: vscode.TextDocument): boolean {
  const currentHash = getDocumentHash(document);
  const previousHash = documentHashes.get(document.fileName);

  return previousHash !== undefined && previousHash !== currentHash;
}

function rememberDocumentHash(document: vscode.TextDocument) {
  documentHashes.set(document.fileName, getDocumentHash(document));
}

function getDocumentHash(document: vscode.TextDocument): string {
  return crypto
    .createHash('sha256')
    .update(document.getText())
    .digest('hex');
}

export function resolveReloadUrl(fileName?: string): string {
  const configuredUrl = getConfiguredReloadUrl(fileName);

  if (configuredUrl) {
    return configuredUrl;
  }

  const normalizedFileName = fileName?.replace(/\\/g, '/');

  if (normalizedFileName?.startsWith(`${WORKTREE_BASE_PATH}`)) {
    const worktreeName = normalizedFileName
      .slice(WORKTREE_BASE_PATH.length)
      .split('/')[0];

    if (worktreeName) {
      return buildReloadUrl(
        `${slugifyWorktreeName(worktreeName)}.bisdev.local.com`
      );
    }
  }

  if (normalizedFileName?.startsWith(`${MAIN_APP_PATH}/`)) {
    return buildReloadUrl(MAIN_APP_HOST);
  }

  return buildReloadUrl(MAIN_APP_HOST);
}

function getConfiguredReloadUrl(fileName?: string): string | undefined {
  const resource = fileName ? vscode.Uri.file(fileName) : undefined;
  const inspected = vscode.workspace
    .getConfiguration('bisReload', resource)
    .inspect<string>('reloadUrl');

  return inspected?.workspaceFolderValue
    ?? inspected?.workspaceValue
    ?? inspected?.globalValue;
}

function slugifyWorktreeName(worktreeName: string): string {
  return worktreeName
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
}

function buildReloadUrl(host: string): string {
  return `https://${host}${RELOAD_PATH}`;
}

async function callUrlAndCheck(url: string): Promise<'success' | 'failure' | 'cancelled'> {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const requestModule = isHttps ? https : http;
    const requestOptions: https.RequestOptions = {
      method: 'GET',
      timeout: 30000
    };

    if (isHttps && parsedUrl.hostname.endsWith('.local.com')) {
      requestOptions.rejectUnauthorized = false;
    }

    let isSettled = false;
    const settle = (result: 'success' | 'failure' | 'cancelled') => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      activeReloadRequest = undefined;
      resolve(result);
    };

    const request = requestModule.request(parsedUrl, requestOptions, (response) => {
      response.resume();

      const statusCode = response.statusCode ?? 0;
      settle(statusCode >= 200 && statusCode < 300 ? 'success' : 'failure');
    });
    activeReloadRequest = request;

    request.on('timeout', () => {
      request.destroy();
      settle('failure');
    });

    request.on('error', () => {
      settle(stopReloadRequested ? 'cancelled' : 'failure');
    });

    request.end();
  });
}

function showSuccessNotification(source: 'auto' | 'manual') {
  const sourceLabel = source === 'auto' ? 'Auto-reload' : 'Manual reload';

  vscode.window.showInformationMessage(
    `${sourceLabel}: BIS Application reloaded successfully.`
  );
}

function showFailureNotification() {
  vscode.window.showErrorMessage(
    'Unable to Reload the BIS Application. Please check the error logs for more details.'
  );
}
