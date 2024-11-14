/*
 * Project: ESP-IDF Web Extension
 * File Created: Thursday, 14th November 2024 12:28:12 pm
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
import { Terminal, Uri, window, workspace } from "vscode";
import { getMonitorBaudRate } from "./utils";
import { SerialTerminal } from "./serialPseudoTerminal";

export const TERMINAL_NAME = "ESP-IDF Web Monitor";

export class IDFWebMonitorTerminal {
  private static instance: Terminal | undefined;
  private static serialTerminal: SerialTerminal | undefined;

  static async init(workspaceFolder: Uri, transport: Transport) {
    if (!this.instance) {
      this.instance = await this.createMonitorTerminal(
        workspaceFolder,
        transport
      );
    }
    return this.instance;
  }

  static exists() {
    return this.instance !== undefined;
  }

  static async dispose() {
    await this.serialTerminal?.close();
    this.instance = undefined;
    this.serialTerminal = undefined;
  }

  static async createMonitorTerminal(
    workspaceFolder: Uri,
    transport: Transport
  ) {
    const monitorBaudRate = await getMonitorBaudRate(workspaceFolder);
    if (!monitorBaudRate) {
      return;
    }

    this.serialTerminal = new SerialTerminal(transport);

    let idfTerminal = window.createTerminal({
      name: TERMINAL_NAME,
      pty: this.serialTerminal,
    });
    idfTerminal.show();
    await transport.connect(monitorBaudRate, { baudRate: monitorBaudRate });
    idfTerminal.sendText(`Opened with baud rate: ${monitorBaudRate}`);
    return idfTerminal;
  }
}
