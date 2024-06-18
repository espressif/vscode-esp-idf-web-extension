/*
 * Project: ESP-IDF Web Extension
 * File Created: Monday, 17th June 2024 2:36:19 pm
 * Copyright 2024 Espressif Systems (Shanghai) CO LTD
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as vscode from "vscode";
import { flashWithWebSerial, monitorWithWebserial } from "./webserial";

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "esp-idf-web.flash",
    async () => {
      let workspaceFolder = await vscode.window.showWorkspaceFolderPick({
        placeHolder: `Pick Workspace Folder to load binaries to flash`,
      });
      if (workspaceFolder) {
        flashWithWebSerial(workspaceFolder.uri);
      }
    }
  );

  context.subscriptions.push(disposable);

  const monitorDisposable = vscode.commands.registerCommand(
    "esp-idf-web.monitor",
    async () => {
      await monitorWithWebserial();
    }
  );
  context.subscriptions.push(monitorDisposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
