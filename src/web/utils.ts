/*
 * Project: ESP-IDF Web Extension
 * File Created: Wednesday, 19th June 2024 9:51:13 am
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

import { FileType, StatusBarAlignment, Uri, window, workspace, FileSystemError, OutputChannel } from "vscode";
import { FlashSectionMessage, PartitionInfo } from "./webserial";
import { Transport, UsbJtagSerialReset } from "esptool-js";

export const errorNotificationMessage =
  "Build file not found. Make sure to build your ESP-IDF project first and if 'idf.buildPath' is defined, that is correctly set.";
// https://issues.chromium.org/issues/40137537
const webUsbPolyfillClaimError = "Failed to execute 'claimInterface' on 'USBDevice': Unable to claim interface.";

const encoder = new TextEncoder();
export const stringToUInt8Array = function(textString: string) {return encoder.encode(textString);};

export function uInt8ArrayToString(fileBuffer: Uint8Array) {
  let fileBufferString = "";
  for (let i = 0; i < fileBuffer.length; i++) {
    fileBufferString += String.fromCharCode(fileBuffer[i]);
  }
  return fileBufferString;
}

export async function universalReset(transport: Transport) {
  if (!transport) {
    return;
  }
  if ((navigator as any).serial !== undefined) { // WebSerial
    await transport.setDTR(false);
    await sleep(100);
    await transport.setDTR(true);
  } else { // WebUSB polyfill
    new UsbJtagSerialReset(transport).reset();
    await sleep(100);
    // can also use SerialReset twice, but then the chip gets reset 1.5 times
    await transport.setRTS(false);
    await transport.setDTR(false);
    await sleep(100);
    await transport.setDTR(true);
    await transport.setRTS(false);
  }
}

export async function handleMonitorError(outputChnl: OutputChannel, error: any) {
  const rawMessage = (error as Error).message.replace("Error setting up device: ", "");
  const errorType = rawMessage.split(":")[0];
  const errorMessage = rawMessage.replace(`${errorType}: `, "");
  outputChnl.show();
  outputChnl.appendLine("\n");
  if (error instanceof FileSystemError && error.code === "FileNotFound") {
    window.showErrorMessage(errorNotificationMessage);
    outputChnl.appendLine(errorNotificationMessage);
    return;
  } else if (errorMessage === webUsbPolyfillClaimError) {
    if ((navigator as any).serial) {
      outputChnl.appendLine("Failed to claim interface. Please detach the device from any app that is using it.");
    } else {
      outputChnl.appendLine("Failed to claim interface. Please open the device in a terminal app to detach the driver.");
    }
    return;
  }
  outputChnl.appendLine(rawMessage);
}

export async function getBuildDirectoryFileContent(
  workspaceFolder: Uri,
  ...fileRelativeToBuildPath: string[]
) {
  let resultFilePath: Uri;
  let buildPath = workspace
    .getConfiguration("", workspaceFolder)
    .get("idf.buildPath") as string;
  if (buildPath) {
    buildPath = resolveVariables(buildPath, workspaceFolder);
    const buildPathUri = Uri.parse(buildPath).with({
      scheme: workspaceFolder.scheme,
      authority: workspaceFolder.authority,
    });
    const buildPathStat = await workspace.fs.stat(buildPathUri);
    if (buildPathStat.type !== FileType.Directory) {
      throw new Error(`${buildPath} is not a directory or does not exists.`);
    }
    resultFilePath = Uri.joinPath(buildPathUri, ...fileRelativeToBuildPath);
  } else {
    resultFilePath = Uri.joinPath(
      workspaceFolder,
      "build",
      ...fileRelativeToBuildPath
    );
  }
  const projDescStat = await workspace.fs.stat(resultFilePath);
  if (projDescStat.type !== FileType.File) {
    throw new Error(`${resultFilePath} does not exists.`);
  }
  const resultFileContent = await workspace.fs.readFile(resultFilePath);
  return uInt8ArrayToString(resultFileContent);
}

export async function getMonitorBaudRate(workspaceFolder: Uri) {
  const projDescContentStr = await getBuildDirectoryFileContent(
    workspaceFolder,
    "project_description.json"
  );
  const projDescFileJson = JSON.parse(projDescContentStr);
  const monitorBaudRateStr = projDescFileJson["monitor_baud"];
  const monitorBaudRateNum = parseInt(monitorBaudRateStr);
  return monitorBaudRateNum;
}

export async function getFlashSectionsForCurrentWorkspace(workspaceFolder: Uri) {
  const flasherArgsContentStr = await getBuildDirectoryFileContent(
    workspaceFolder,
    "flasher_args.json"
  );
  const flashFileJson = JSON.parse(flasherArgsContentStr);
  const binPromises: Promise<PartitionInfo>[] = [];
  Object.keys(flashFileJson["flash_files"]).forEach((offset) => {
    const fileName = flashFileJson["flash_files"][offset] as string;
    binPromises.push(readFileIntoBuffer(workspaceFolder, fileName, offset));
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

export async function readFileIntoBuffer(
  workspaceFolder: Uri,
  name: string,
  offset: string
) {
  const fileBufferString = await getBuildDirectoryFileContent(
    workspaceFolder,
    name
  );
  const fileBufferResult: PartitionInfo = {
    data: fileBufferString,
    name,
    address: parseInt(offset),
  };
  return fileBufferResult;
}

export function resolveVariables(configPath: string, scope: Uri) {
  const regexp = /\$\{(.*?)\}/g; // Find ${anything}
  return configPath.replace(regexp, (match: string) => {
    if (scope && match.indexOf("workspaceFolder") > 0) {
      return scope.fsPath === "/" || scope.fsPath === "\\" ? "" : scope.fsPath;
    }
    return match;
  });
}

export function createStatusBarItem(
  icon: string,
  tooltip: string,
  cmd: string,
  priority: number
) {
  const alignment: StatusBarAlignment = StatusBarAlignment.Left;
  const statusBarItem = window.createStatusBarItem(alignment, priority);
  statusBarItem.text = icon;
  statusBarItem.tooltip = tooltip;
  statusBarItem.command = cmd;
  const enableStatusBarIcons = workspace
    .getConfiguration("")
    .get("idfWeb.enableStatusBarIcons") as boolean;
  if (enableStatusBarIcons) {
    statusBarItem.show();
  }
  return statusBarItem;
}

export async function sleep(ms: number): Promise<any> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
