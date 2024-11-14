/*
 * Project: ESP-IDF Web Extension
 * File Created: Thursday, 14th November 2024 3:22:55 pm
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

import { Transport } from "esptool-js";
import { FileSystemError, Uri, window } from "vscode";
import { IDFWebMonitorTerminal } from "./monitorTerminalManager";
import { errorNotificationMessage, OUTPUT_CHANNEL_NAME } from "./webserial";

export async function monitorWithWebserial(
  workspaceFolder: Uri,
  port: SerialPort
) {
  if (!port) {
    return;
  }
  try {
    const transport = new Transport(port);
    IDFWebMonitorTerminal.init(workspaceFolder, transport);
  } catch (error: any) {
    if (error instanceof FileSystemError && error.code === "FileNotFound") {
      window.showErrorMessage(errorNotificationMessage);
    }
    const outputChnl = window.createOutputChannel(OUTPUT_CHANNEL_NAME);
    outputChnl.appendLine(JSON.stringify(error));
    const errMsg = error && error.message ? error.message : error;
    outputChnl.appendLine(errMsg);
    outputChnl.appendLine(errorNotificationMessage);
    outputChnl.show();
  }
}