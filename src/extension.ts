import * as vscode from 'vscode';

const FIXED_URL = 'http://bis.local.com/v1/index.cfm?action=store.TicketVerification&reload=1';
const COOLDOWN_MS = 5000;

let lastTriggeredAt = 0;

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
    if (!document.fileName.endsWith('.cfc')) {
      return;
    }

    const config = vscode.workspace.getConfiguration('bisReload');
    const autoReload = config.get<boolean>('autoReload', true);

    if (!autoReload) {
      return;
    }

    const now = Date.now();
    if (now - lastTriggeredAt < COOLDOWN_MS) {
      return;
    }

    lastTriggeredAt = now;

    const success = await callUrlAndCheck(FIXED_URL);
    if (success) {
      showSuccessNotification();
    } else {
      showFailureNotification();
    }
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}

async function callUrlAndCheck(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'GET' });
    return response.ok && !response.redirected;
  } catch {
    return false;
  }
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
