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
  FileSystemError,
  OutputChannel,
  Progress,
  ProgressLocation,
  Uri,
  window,
  workspace,
} from "vscode";
import {
  ESPLoader,
  FlashOptions,
  IEspLoaderTerminal,
  LoaderOptions,
  Transport,
} from "esptool-js";
import { enc, MD5 } from "crypto-js";
import { SerialTerminal } from "./serialPseudoTerminal";
import {
  getFlashSectionsForCurrentWorkspace,
  getMonitorBaudRate,
  sleep,
} from "./utils";

export const OUTPUT_CHANNEL_NAME = "ESP-IDF Web";
export const TERMINAL_NAME = "ESP-IDF Web Monitor";
export const errorNotificationMessage =
  "Build file not found. Make sure to build your ESP-IDF project first and if 'idf.buildPath' is defined, that is correctly set.";

export interface PartitionInfo {
  name: string;
  data: string;
  address: number;
}

export interface FlashSectionMessage {
  sections: PartitionInfo[];
  flashSize: string;
  flashMode: string;
  flashFreq: string;
}

export async function createMonitorTerminal(
  workspaceFolder: Uri,
  transport: Transport
) {
  await transport.connect();
  const monitorBaudRate = await getMonitorBaudRate(workspaceFolder);
  if (!monitorBaudRate) {
    return;
  }

  const serialTerminal = new SerialTerminal(transport, {
    baudRate: monitorBaudRate,
  });

  let idfTerminal = window.createTerminal({
    name: TERMINAL_NAME,
    pty: serialTerminal,
  });

  serialTerminal.onDidClose((e) => {
    if (idfTerminal && idfTerminal.exitStatus === undefined) {
      idfTerminal.dispose();
    }
  });

  window.onDidCloseTerminal(async (t) => {
    if (transport && t.name === TERMINAL_NAME && t.exitStatus) {
      await transport.disconnect();
    }
  });
  idfTerminal.show();
  return idfTerminal;
}

export async function monitorWithWebserial(
  workspaceFolder: Uri,
  port: SerialPort
) {
  if (!port) {
    return;
  }
  try {
    const transport = new Transport(port);
    return await createMonitorTerminal(workspaceFolder, transport);
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

export let isFlashing: boolean = false;

export async function flashTask(
  workspaceFolder: Uri,
  port: SerialPort,
  progress: Progress<{ message: string }>,
  outputChannel: OutputChannel
) {
  isFlashing = true;
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
      `idfWeb.flashBaudRate not defined. Using default value ${flashBaudRate}`
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
    `ESP-IDF Web Flashing with Webserial using baud rate ${flashBaudRate}`
  );
  outputChannel.show();
  const esploader = new ESPLoader(loaderOptions);
  const chip = await esploader.main();
  const flashSectionsMessage = await getFlashSectionsForCurrentWorkspace(
    workspaceFolder
  );
  const flashOptions: FlashOptions = {
    fileArray: flashSectionsMessage.sections,
    flashSize: flashSectionsMessage.flashSize,
    flashFreq: flashSectionsMessage.flashFreq,
    flashMode: flashSectionsMessage.flashMode,
    eraseAll: false,
    compress: true,
    reportProgress: (fileIndex: number, written: number, total: number) => {
      progress.report({
        message: `${flashSectionsMessage.sections[fileIndex].name} (${written}/${total})`,
      });
      outputChannel.appendLine(
        `${flashSectionsMessage.sections[fileIndex].name} (${written}/${total})`
      );
    },
    calculateMD5Hash: (image: string) =>
      MD5(enc.Latin1.parse(image)).toString(),
  } as FlashOptions;

  await esploader.writeFlash(flashOptions);
  progress.report({ message: `ESP-IDF Web Flashing done` });
  outputChannel.appendLine(`ESP-IDF Web Flashing done`);
  if (transport) {
    await transport.disconnect();
  }
  isFlashing = false;
  return transport;
}

export async function flashWithWebSerial(
  workspaceFolder: Uri,
  port: SerialPort
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
      cancelToken: CancellationToken
    ) => {
      const outputChnl = window.createOutputChannel(OUTPUT_CHANNEL_NAME);
      try {
        await flashTask(workspaceFolder, port, progress, outputChnl);
      } catch (error: any) {
        isFlashing = false;
        if (error instanceof FileSystemError && error.code === "FileNotFound") {
          window.showErrorMessage(errorNotificationMessage);
        }
        outputChnl.appendLine(JSON.stringify(error));
        const errMsg = error && error.message ? error.message : error;
        outputChnl.appendLine(errMsg);
        outputChnl.appendLine(errorNotificationMessage);
        outputChnl.show();
      }
    }
  );
}

export async function flashAndMonitor(workspaceFolder: Uri, port: SerialPort) {
  return await window.withProgress(
    {
      cancellable: false,
      location: ProgressLocation.Notification,
      title: "Flashing with WebSerial then launching Monitor...",
    },
    async (
      progress: Progress<{
        message: string;
      }>,
      cancelToken: CancellationToken
    ) => {
      const outputChnl = window.createOutputChannel(OUTPUT_CHANNEL_NAME);
      try {
        const transport = await flashTask(
          workspaceFolder,
          port,
          progress,
          outputChnl
        );
        await transport.waitForUnlock(500);
        return await createMonitorTerminal(workspaceFolder, transport);
      } catch (error: any) {
        isFlashing = false;
        if (error instanceof FileSystemError && error.code === "FileNotFound") {
          window.showErrorMessage(errorNotificationMessage);
        }
        outputChnl.appendLine(JSON.stringify(error));
        const errMsg = error && error.message ? error.message : error;
        outputChnl.appendLine(errMsg);
        outputChnl.appendLine(errorNotificationMessage);
        outputChnl.show();
      }
    }
  );
}
