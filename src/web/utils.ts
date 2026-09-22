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

import {
  FileType,
  StatusBarAlignment,
  Uri,
  window,
  workspace,
  FileSystemError,
  OutputChannel,
} from "vscode";
import { FlashSectionMessage, PartitionInfo } from "./webserial";
import { Transport, UsbJtagSerialReset, USB_JTAG_SERIAL_PID } from "esptool-js";

export const OUTPUT_CHANNEL_NAME = "ESP-IDF Web";

let outputChannel: OutputChannel | undefined = undefined;
export function getOutputChannel(): OutputChannel {
  if (!outputChannel) {
    outputChannel = window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  }
  return outputChannel;
}

export const errorNotificationMessage =
  "Build file not found. Make sure to build your ESP-IDF project first and if 'idf.buildPath' is defined, that is correctly set.";
// https://issues.chromium.org/issues/40137537
const webUsbPolyfillClaimError =
  "Failed to execute 'claimInterface' on 'USBDevice': Unable to claim interface.";

const encoder = new TextEncoder();
export const stringToUInt8Array = function (textString: string) {
  return encoder.encode(textString);
};

const decoder = new TextDecoder("utf-8");
export function uInt8ArrayToString(fileBuffer: Uint8Array) {
  return decoder.decode(fileBuffer, { stream: true });
}

export async function universalReset(transport: Transport) {
  if (!transport) {
    return;
  }
  if (transport.getPid() === USB_JTAG_SERIAL_PID) {
    await new UsbJtagSerialReset(transport).reset();
    await sleep(100);
    return;
  }
  // Classic auto-reset circuit: DTR drives IO0 and RTS drives EN.
  // IO0 must stay high so the chip runs the app instead of the ROM bootloader.
  await transport.setDTR(false);
  await transport.setRTS(true);
  await sleep(100);
  await transport.setRTS(false);
}

export async function handleMonitorError(error: any) {
  const rawMessage =
    error instanceof Error
      ? error.message.replace("Error setting up device: ", "")
      : String(error);
  const errorType = rawMessage.split(":")[0];
  const errorMessage = rawMessage.replace(`${errorType}: `, "");
  const outputChnl = getOutputChannel();
  outputChnl.show();
  outputChnl.appendLine("\n");
  if (error instanceof FileSystemError && error.code === "FileNotFound") {
    window.showErrorMessage(errorNotificationMessage);
    outputChnl.appendLine(errorNotificationMessage);
    return;
  } else if (errorMessage === webUsbPolyfillClaimError) {
    if ((navigator as any).serial) {
      outputChnl.appendLine(
        "Failed to claim interface. Please detach the device from any app that is using it.",
      );
    } else {
      outputChnl.appendLine(
        "Failed to claim interface. Please open the device in a terminal app to detach the driver.",
      );
    }
    return;
  }
  outputChnl.appendLine(rawMessage);
}

async function getBuildDirectoryFilePath(
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
      ...fileRelativeToBuildPath,
    );
  }
  const projDescStat = await workspace.fs.stat(resultFilePath);
  if (projDescStat.type !== FileType.File) {
    throw new Error(`${resultFilePath} does not exists.`);
  }
  return resultFilePath;
}

export async function getBuildDirectoryFileBuffer(
  workspaceFolder: Uri,
  ...fileRelativeToBuildPath: string[]
) {
  const resultFilePath = await getBuildDirectoryFilePath(
    workspaceFolder,
    ...fileRelativeToBuildPath,
  );
  return workspace.fs.readFile(resultFilePath);
}

export async function getBuildDirectoryFileContent(
  workspaceFolder: Uri,
  ...fileRelativeToBuildPath: string[]
) {
  const resultFileContent = await getBuildDirectoryFileBuffer(
    workspaceFolder,
    ...fileRelativeToBuildPath,
  );
  return uInt8ArrayToString(resultFileContent);
}

const DEFAULT_MONITOR_BAUD_RATE = 115200;

function getConfiguredMonitorBaudRate() {
  const configBaud = workspace
    .getConfiguration("")
    .get("idfWeb.monitorBaudRate") as number;
  return configBaud || DEFAULT_MONITOR_BAUD_RATE;
}

function isMissingBuildFileError(error: unknown) {
  if (error instanceof FileSystemError && error.code === "FileNotFound") {
    return true;
  }
  if (error instanceof Error) {
    return (
      error.message.includes("does not exists") ||
      error.message.includes("is not a directory")
    );
  }
  return false;
}

function logMonitorBaudFallback(reason: string) {
  const outputChnl = getOutputChannel();
  const message = `Using idfWeb.monitorBaudRate for monitor baud rate.\nReason ${reason}`;
  outputChnl.appendLine(message);
  window.showInformationMessage(message);
}

export async function getMonitorBaudRate(workspaceFolder?: Uri) {
  if (workspaceFolder) {
    try {
      const projDescContentStr = await getBuildDirectoryFileContent(
        workspaceFolder,
        "project_description.json",
      );
      const projDescFileJson = JSON.parse(projDescContentStr);
      const monitorBaudRateStr = projDescFileJson["monitor_baud"];
      const monitorBaudRateNum = parseInt(monitorBaudRateStr);
      if (monitorBaudRateNum) {
        return monitorBaudRateNum;
      }
    } catch (error) {
      if (!isMissingBuildFileError(error)) {
        throw error;
      }
    }
    logMonitorBaudFallback("project_description.json not found.");
  } else {
    logMonitorBaudFallback("No workspace folder opened.");
  }
  return getConfiguredMonitorBaudRate();
}

export async function getFlashSectionsForCurrentWorkspace(
  workspaceFolder: Uri,
) {
  const flasherArgsContentStr = await getBuildDirectoryFileContent(
    workspaceFolder,
    "flasher_args.json",
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
  offset: string,
) {
  const fileBuffer = await getBuildDirectoryFileBuffer(workspaceFolder, name);
  const fileBufferResult: PartitionInfo = {
    data: fileBuffer,
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
  priority: number,
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
