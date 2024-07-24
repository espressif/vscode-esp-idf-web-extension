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
  // let port: SerialPort | undefined;
  const flashDisposable = vscode.commands.registerCommand(
    "esp-idf-web.flash",
    async () => {
      let workspaceFolder = await vscode.window.showWorkspaceFolderPick({
        placeHolder: `Pick Workspace Folder to load binaries to flash`,
      });
      let port = await getSerialPort();
      if (workspaceFolder && port) {
        flashWithWebSerial(workspaceFolder.uri, port);
      }
    }
  );

  context.subscriptions.push(flashDisposable);

  const monitorDisposable = vscode.commands.registerCommand(
    "esp-idf-web.monitor",
    async () => {
      let workspaceFolder = await vscode.window.showWorkspaceFolderPick({
        placeHolder: `Pick Workspace Folder to start ESP-IDF monitor`,
      });
      let port = await getSerialPort();
      if (workspaceFolder && port) {
        await monitorWithWebserial(workspaceFolder.uri, port);
      }
    }
  );
  context.subscriptions.push(monitorDisposable);

  const disposePort = vscode.commands.registerCommand(
    "esp-idf-web.disposePort",
    async () => {
      // port = undefined;
    }
  );
  context.subscriptions.push(disposePort);
}

// This method is called when your extension is deactivated
export function deactivate() {}

async function getSerialPort() {
  const portInfo = (await vscode.commands.executeCommand(
    "workbench.experimental.requestSerialPort"
  )) as SerialPortInfo;
  if (!portInfo) {
    return;
  }
  const ports = await navigator.serial.getPorts();
  let port = ports.find((item) => {
    const info = item.getInfo();
    return (
      info.usbVendorId === portInfo.usbVendorId &&
      info.usbProductId === portInfo.usbProductId
    );
  });
  return port;
}
