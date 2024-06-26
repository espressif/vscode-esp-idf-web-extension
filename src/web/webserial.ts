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
  FileType,
  Progress,
  ProgressLocation,
  Uri,
  commands,
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
import { uInt8ArrayToString } from "./utils";
import { SerialTerminal } from "./serialPseudoTerminal";

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

export async function monitorWithWebserial() {
  const portInfo = (await commands.executeCommand(
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
  if (!port) {
    return;
  }
  const monitorBaudRate = await window.showQuickPick(
    [
      { description: "74880", label: "74880", target: 74880 },
      { description: "115200", label: "115200", target: 115200 },
    ],
    { placeHolder: "Select baud rate" }
  );
  if (!monitorBaudRate) {
    return;
  }
  const transport = new Transport(port);
  await transport.connect();

  const serialTerminal = new SerialTerminal(transport, {
    baudRate: monitorBaudRate.target,
  });

  let idfTerminal = window.createTerminal({
    name: "ESP-IDF Web Monitor",
    pty: serialTerminal,
  });

  serialTerminal.onDidClose((e) => {
    if (idfTerminal && idfTerminal.exitStatus === undefined) {
      idfTerminal.dispose();
    }
  });

  window.onDidCloseTerminal(async (t) => {
    if (t.name === "ESP-IDF Web Monitor" && t.exitStatus) {
      await transport.disconnect();
      port = undefined;
    }
  });
  idfTerminal.show();
}

export async function flashWithWebSerial(workspace: Uri) {
  try {
    window.withProgress(
      {
        cancellable: true,
        location: ProgressLocation.Notification,
        title: "Flashing with WebSerial...",
      },
      async (
        progress: Progress<{
          message: string;
        }>,
        cancelToken: CancellationToken
      ) => {
        const portInfo = (await commands.executeCommand(
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
        if (!port) {
          return;
        }
        const transport = new Transport(port);
        const outputChnl = window.createOutputChannel("ESP-IDF Web");
        const clean = () => {
          outputChnl.clear();
        };
        const writeLine = (data: string) => {
          outputChnl.appendLine(data);
        };
        const write = (data: string) => {
          outputChnl.append(data);
        };

        const loaderTerminal: IEspLoaderTerminal = {
          clean,
          write,
          writeLine,
        };

        const flashBaudRate = await window.showQuickPick(
          [
            { description: "115200", label: "115200", target: 115200 },
            { description: "230400", label: "230400", target: 230400 },
            { description: "460800", label: "460800", target: 460800 },
            { description: "921600", label: "921600", target: 921600 },
          ],
          { placeHolder: "Select baud rate" }
        );
        if (!flashBaudRate) {
          return;
        }
        const loaderOptions = {
          transport,
          baudrate: flashBaudRate.target,
          terminal: loaderTerminal,
        } as LoaderOptions;
        progress.report({
          message: `ESP-IDF Web Flashing using baud rate ${flashBaudRate.target}`,
        });
        outputChnl.appendLine(
          `ESP-IDF Web Flashing with Webserial using baud rate ${flashBaudRate.target}`
        );
        outputChnl.show();
        const esploader = new ESPLoader(loaderOptions);
        const chip = await esploader.main();
        const flashSectionsMessage = await getFlashSectionsForCurrentWorkspace(
          workspace
        );
        const flashOptions: FlashOptions = {
          fileArray: flashSectionsMessage.sections,
          flashSize: flashSectionsMessage.flashSize,
          flashFreq: flashSectionsMessage.flashFreq,
          flashMode: flashSectionsMessage.flashMode,
          eraseAll: false,
          compress: true,
          reportProgress: (
            fileIndex: number,
            written: number,
            total: number
          ) => {
            progress.report({
              message: `${flashSectionsMessage.sections[fileIndex].name} (${written}/${total})`,
            });
          },
          calculateMD5Hash: (image: string) =>
            MD5(enc.Latin1.parse(image)).toString(),
        } as FlashOptions;

        await esploader.writeFlash(flashOptions);
        progress.report({ message: `ESP-IDF Web Flashing done` });
        outputChnl.appendLine(`ESP-IDF Web Flashing done`);
        if (transport) {
          await transport.disconnect();
        }
        if (port) {
          port = undefined;
        }
      }
    );
  } catch (error: any) {
    const outputChnl = window.createOutputChannel("ESP-IDF Web");
    const errMsg = error && error.message ? error.message : error;
    outputChnl.appendLine(errMsg);
  }
}

async function getFlashSectionsForCurrentWorkspace(workspaceFolder: Uri) {
  const flashInfoFileName = Uri.joinPath(
    workspaceFolder,
    "build",
    "flasher_args.json"
  );
  const flasherArgsStat = await workspace.fs.stat(flashInfoFileName);
  if (flasherArgsStat.type !== FileType.File) {
    throw new Error(`${flashInfoFileName} does not exists.`);
  }
  const flasherArgsContent = await workspace.fs.readFile(flashInfoFileName);
  if (!flasherArgsContent) {
    throw new Error("Build before flashing");
  }
  let flasherArgsContentStr = uInt8ArrayToString(flasherArgsContent);
  const flashFileJson = JSON.parse(flasherArgsContentStr);
  const binPromises: Promise<PartitionInfo>[] = [];
  Object.keys(flashFileJson["flash_files"]).forEach((offset) => {
    const fileName = flashFileJson["flash_files"][offset];
    const filePath = Uri.joinPath(
      workspaceFolder,
      "build",
      flashFileJson["flash_files"][offset]
    );
    binPromises.push(readFileIntoBuffer(filePath, fileName, offset));
  });
  const binaries = await Promise.all(binPromises);
  const message: FlashSectionMessage = {
    sections: binaries,
    flashFreq: flashFileJson["flash_settings"]["flash_freq"],
    flashMode: flashFileJson["flash_settings"]["flash_mode"],
    flashSize: flashFileJson["flash_settings"]["flash_size"],
  };
  return message;
}

async function readFileIntoBuffer(filePath: Uri, name: string, offset: string) {
  const fileBuffer = await workspace.fs.readFile(filePath);
  let fileBufferString = uInt8ArrayToString(fileBuffer);
  const fileBufferResult: PartitionInfo = {
    data: fileBufferString,
    name,
    address: parseInt(offset),
  };
  return fileBufferResult;
}
