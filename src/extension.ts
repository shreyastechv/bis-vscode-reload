import * as vscode from 'vscode';

const FIXED_URL = 'http://bis.local.com/v1/index.cfm?action=store.TicketVerification&reload=1';

let lastTriggeredAt = 0;

export function activate(context: vscode.ExtensionContext) {
  const saveDisposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
    if (!document.fileName.endsWith('.cfc')) {
      return;
    }

    const config = vscode.workspace.getConfiguration('bisReload');
    const autoReload = config.get<boolean>('autoReload', true);
    const cooldownMs = config.get<number>('cooldownMs', 5000);

    if (!autoReload) {
      return;
    }

    const now = Date.now();
    if (now - lastTriggeredAt < cooldownMs) {
      return;
    }

    lastTriggeredAt = now;
    await triggerReload();
  });

  // Manual command
  const commandDisposable = vscode.commands.registerCommand(
    'bisReload.triggerReload',
    async () => {
      await triggerReload();
    }
  );

  context.subscriptions.push(saveDisposable, commandDisposable);
}

async function triggerReload() {
  const config = vscode.workspace.getConfiguration('bisReload');
  const cooldownMs = config.get<number>('cooldownMs', 5000);

  const now = Date.now();
  if (now - lastTriggeredAt < cooldownMs) {
    return;
  }

  lastTriggeredAt = now;

  const success = await callUrlAndCheck(FIXED_URL);
  if (success) {
    showSuccessNotification();
  } else {
    showFailureNotification();
  }
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
