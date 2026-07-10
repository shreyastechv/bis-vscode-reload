import * as http from 'http';
import * as https from 'https';
import * as vscode from 'vscode';

const MAIN_APP_PATH = '/var/www/bistrainer/app';
const WORKTREE_BASE_PATH = '/var/www/bistrainer/app-worktrees/';
const MAIN_APP_HOST = 'bisdev.local.com';
const RELOAD_PATH = '/v1/index.cfm?action=store.TicketVerification&reload=1';

let lastTriggeredAt = 0;
let isReloading = false;
let statusBar: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  const saveDisposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
    if (!document.fileName.endsWith('.cfc')) {
      return;
    }

    const config = vscode.workspace.getConfiguration('bisReload');
    const autoReload = config.get<boolean>('autoReload', true);

    if (!autoReload) {
      return;
    }

    await triggerReload('auto', document.fileName);
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

  // Status bar
  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left
  );

  context.subscriptions.push(saveDisposable, commandDisposable, statusBar);
}

async function triggerReload(source: 'auto' | 'manual' = 'auto', fileName?: string) {
  const config = vscode.workspace.getConfiguration('bisReload');
  const cooldownMs = config.get<number>('cooldownMs', 5000);
  const reloadUrl = resolveReloadUrl(fileName);

  if (isReloading) {
    if (source === 'manual') {
      vscode.window.showWarningMessage('Reload already in progress.');
    }
    return;
  }

  const now = Date.now();
  if (source === 'auto' && now - lastTriggeredAt < cooldownMs) {
    return;
  }

  statusBar.text = '$(sync~spin) Reloading BIS...';
  statusBar.tooltip = `Reload URL: ${reloadUrl}`;
  statusBar.show();

  lastTriggeredAt = now;
  isReloading = true;

  try {
    const success = await callUrlAndCheck(reloadUrl);
    if (success) {
      showSuccessNotification();
    } else {
      showFailureNotification();
    }
  } finally {
    isReloading = false;
    statusBar.tooltip = undefined;
    statusBar.hide();
  }
}

export function deactivate() {}

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

async function callUrlAndCheck(url: string): Promise<boolean> {
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

    const request = requestModule.request(parsedUrl, requestOptions, (response) => {
      response.resume();

      const statusCode = response.statusCode ?? 0;
      resolve(statusCode >= 200 && statusCode < 300);
    });

    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });

    request.on('error', () => {
      resolve(false);
    });

    request.end();
  });
}

function showSuccessNotification() {
  vscode.window.showInformationMessage(
    'BIS Application reloaded successfully.'
  );
}

function showFailureNotification() {
  vscode.window.showErrorMessage(
    'Unable to Reload the BIS Application. Please check the error logs for more details.'
  );
}
