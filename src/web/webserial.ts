/*
 * Project: ESP-IDF Web Extension
 * File Created: Monday, 17th June 2024 2:46:00 pm
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

import {
  CancellationToken,
  Progress,
  ProgressLocation,
  Uri,
  window,
  workspace,
} from "vscode";
import {
  ESPLoader,
  FlashFreqValues,
  FlashModeValues,
  FlashOptions,
  FlashSizeValues,
  IEspLoaderTerminal,
  LoaderOptions,
  Transport,
} from "esptool-js";
import { enc, MD5 } from "crypto-js";
import {
  getFlashSectionsForCurrentWorkspace,
  handleMonitorError,
  getOutputChannel,
  universalReset,
} from "./utils";
import { IDFWebMonitorTerminal } from "./monitorTerminalManager";

export interface PartitionInfo {
  name: string;
  data: Uint8Array;
  address: number;
}

export interface FlashSectionMessage {
  sections: PartitionInfo[];
  flashSize: string;
  flashMode: string;
  flashFreq: string;
}

export let isFlashing: boolean = false;

export async function flashTask(
  workspaceFolder: Uri,
  port: SerialPort,
  progress: Progress<{ message: string }>,
) {
  const outputChannel = getOutputChannel();
  isFlashing = true;
  let transport: Transport | undefined;
  try {
    const flashSectionsMessage =
      await getFlashSectionsForCurrentWorkspace(workspaceFolder);
    transport = new Transport(port);
    const clean = () => {
      outputChannel.clear();
    };
    const writeLine = (data: string) => {
      outputChannel.appendLine(data);
    };
    const write = (data: string) => {
      outputChannel.append(data);
    };

    const loaderTerminal: IEspLoaderTerminal = {
      clean,
      write,
      writeLine,
    };
    let flashBaudRate = await workspace
      .getConfiguration("", workspaceFolder)
      .get("idfWeb.flashBaudRate");
    if (!flashBaudRate) {
      flashBaudRate = 921600;
      outputChannel.appendLine(
        `idfWeb.flashBaudRate not defined. Using default value ${flashBaudRate}`,
      );
    }
    const loaderOptions = {
      transport,
      baudrate: flashBaudRate,
      terminal: loaderTerminal,
    } as LoaderOptions;
    progress.report({
      message: `ESP-IDF Web Flashing using baud rate ${flashBaudRate}`,
    });
    outputChannel.appendLine(
      `ESP-IDF Web Flashing with Webserial using baud rate ${flashBaudRate}`,
    );
    outputChannel.show();
    const esploader = new ESPLoader(loaderOptions);
    const flashOptions: FlashOptions = {
      fileArray: flashSectionsMessage.sections,
      flashSize: flashSectionsMessage.flashSize as FlashSizeValues,
      flashFreq: flashSectionsMessage.flashFreq as FlashFreqValues,
      flashMode: flashSectionsMessage.flashMode as FlashModeValues,
      eraseAll: false,
      compress: true,
      reportProgress: (fileIndex: number, written: number, total: number) => {
        progress.report({
          message: `${flashSectionsMessage.sections[fileIndex].name} (${written}/${total})`,
        });
        outputChannel.appendLine(
          `${flashSectionsMessage.sections[fileIndex].name} (${written}/${total})`,
        );
      },
      calculateMD5Hash: (image: Uint8Array) => {
        const latin1String = Array.from(image, (byte) =>
          String.fromCharCode(byte),
        ).join("");
        return MD5(enc.Latin1.parse(latin1String)).toString();
      },
    };

    await esploader.main();
    await esploader.writeFlash(flashOptions);
    progress.report({ message: `ESP-IDF Web Flashing done` });
    window.showInformationMessage(`ESP-IDF Web Flashing done.`);
    outputChannel.appendLine(`ESP-IDF Web Flashing done`);
    await universalReset(transport);
    return transport;
  } finally {
    isFlashing = false;
    if (transport) {
      try {
        await transport.disconnect();
      } catch {
        // The serial port may already be closed after a failed connect.
      }
    }
  }
}

export async function flashWithWebSerial(
  workspaceFolder: Uri,
  port: SerialPort,
) {
  await window.withProgress(
    {
      cancellable: false,
      location: ProgressLocation.Notification,
      title: "Flashing with WebSerial...",
    },
    async (
      progress: Progress<{
        message: string;
      }>,
      cancelToken: CancellationToken,
    ) => {
      try {
        await flashTask(workspaceFolder, port, progress);
      } catch (error: any) {
        isFlashing = false;
        handleMonitorError(error);
      }
    },
  );
}

export async function flashAndMonitor(workspaceFolder: Uri, port: SerialPort) {
  return await window.withProgress(
    {
      cancellable: false,
      location: ProgressLocation.Notification,
      title: "Flash and Monitor...",
    },
    async (
      progress: Progress<{
        message: string;
      }>,
      cancelToken: CancellationToken,
    ) => {
      try {
        const transport = await flashTask(workspaceFolder, port, progress);
        await transport.waitForUnlock(500);
        await IDFWebMonitorTerminal.init(workspaceFolder, transport);
      } catch (error: any) {
        isFlashing = false;
        handleMonitorError(error);
        IDFWebMonitorTerminal.dispose();
      }
    },
  );
}

export async function eraseFlash(workspaceFolder: Uri, port: SerialPort) {
  return await window.withProgress(
    {
      cancellable: false,
      location: ProgressLocation.Notification,
      title: "Erasing Flash...",
    },
    async (
      progress: Progress<{
        message: string;
      }>,
      cancelToken: CancellationToken,
    ) => {
      const outputChannel = getOutputChannel();
      try {
        const transport = new Transport(port);
        const clean = () => {
          outputChannel.clear();
        };
        const writeLine = (data: string) => {
          outputChannel.appendLine(data);
        };
        const write = (data: string) => {
          outputChannel.append(data);
        };
        const loaderTerminal: IEspLoaderTerminal = {
          clean,
          write,
          writeLine,
        };
        let flashBaudRate = await workspace
          .getConfiguration("", workspaceFolder)
          .get("idfWeb.flashBaudRate");
        if (!flashBaudRate) {
          flashBaudRate = 921600;
          outputChannel.appendLine(
            `idfWeb.flashBaudRate not defined. Using default value ${flashBaudRate}`,
          );
        }
        const loaderOptions = {
          transport,
          baudrate: flashBaudRate,
          terminal: loaderTerminal,
        } as LoaderOptions;
        progress.report({
          message: `Using baud rate ${flashBaudRate}`,
        });
        outputChannel.appendLine(
          `ESP-IDF Web Erasing flash with Webserial using baud rate ${flashBaudRate}`,
        );
        outputChannel.show();
        const esploader = new ESPLoader(loaderOptions);
        const chip = await esploader.main();

        await esploader.eraseFlash();
        transport.drainInput();
        progress.report({
          message: `Erase flash finished`,
        });
        outputChannel.appendLine(`ESP-IDF Web Erase flash finished`);
      } catch (error) {
        handleMonitorError(error);
        IDFWebMonitorTerminal.dispose();
      }
    },
  );
}
