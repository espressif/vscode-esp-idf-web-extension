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
  "Build file not found. Make sure to build your ESP-IDF project first and if 'idfWeb.buildPath' is defined, that is correctly set.";
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
  if (isBuildPathUserError(error)) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : errorNotificationMessage;
    window.showErrorMessage(message);
    outputChnl.appendLine(message);
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

function readConfiguredBuildPath(workspaceFolder: Uri) {
  return workspace
    .getConfiguration("", workspaceFolder)
    .get<string>("idfWeb.buildPath");
}

function splitPathSegments(value: string) {
  return value.split(/[/\\]+/).filter((segment) => segment.length > 0);
}

function isAbsolutePosixPath(value: string) {
  return value.startsWith("/");
}

function buildDirectoryMissingMessage(buildDir: Uri) {
  return `Build path does not exist: ${buildDir.toString()}. Build your ESP-IDF project first or set 'idfWeb.buildPath' to the build directory.`;
}

function buildFileMissingMessage(fileUri: Uri) {
  return `Build file not found: ${fileUri.toString()}. Make sure to build your ESP-IDF project first and if 'idfWeb.buildPath' is defined, that is correctly set.`;
}

function isBuildPathUserError(error: unknown) {
  if (error instanceof FileSystemError && error.code === "FileNotFound") {
    return true;
  }
  if (error instanceof Error) {
    return (
      error.message.includes("Build path does not exist") ||
      error.message.includes("Build file not found") ||
      error.message.includes("does not exists") ||
      error.message.includes("is not a directory")
    );
  }
  return false;
}

export function resolveBuildDirectoryUri(
  workspaceFolder: Uri,
  configuredPath?: string | null,
) {
  const trimmed = configuredPath?.trim() ?? "";
  if (!trimmed) {
    return Uri.joinPath(workspaceFolder, "build");
  }

  const hasWorkspaceFolderVar = /\$\{workspaceFolder\}/i.test(trimmed);
  let normalized = hasWorkspaceFolderVar
    ? trimmed
        .replace(/\$\{workspaceFolder\}/gi, "")
        .replace(/^[/\\]+/, "")
    : trimmed;
  normalized = normalized.replace(/\\/g, "/").replace(/\/+$/, "");

  if (!normalized) {
    return workspaceFolder;
  }
  if (!hasWorkspaceFolderVar && isAbsolutePosixPath(normalized)) {
    return workspaceFolder.with({ path: normalized });
  }
  const segments = splitPathSegments(normalized);
  if (segments.length === 0) {
    return Uri.joinPath(workspaceFolder, "build");
  }
  return Uri.joinPath(workspaceFolder, ...segments);
}

function logUsingBuildPath(buildDir: Uri) {
  getOutputChannel().appendLine(`Using build path: ${buildDir.toString()}`);
}

async function getBuildDirectoryUri(workspaceFolder: Uri) {
  return resolveBuildDirectoryUri(
    workspaceFolder,
    readConfiguredBuildPath(workspaceFolder),
  );
}

async function ensureBuildDirectoryExists(workspaceFolder: Uri) {
  const buildDir = await getBuildDirectoryUri(workspaceFolder);
  try {
    const buildPathStat = await workspace.fs.stat(buildDir);
    if (buildPathStat.type !== FileType.Directory) {
      throw new Error(buildDirectoryMissingMessage(buildDir));
    }
  } catch (error) {
    if (error instanceof FileSystemError && error.code === "FileNotFound") {
      throw new Error(buildDirectoryMissingMessage(buildDir));
    }
    throw error;
  }
  return buildDir;
}

async function getBuildDirectoryFilePath(
  workspaceFolder: Uri,
  ...fileRelativeToBuildPath: string[]
) {
  const buildDir = await ensureBuildDirectoryExists(workspaceFolder);
  const segments = fileRelativeToBuildPath.flatMap(splitPathSegments);
  const resultFilePath =
    segments.length > 0 ? Uri.joinPath(buildDir, ...segments) : buildDir;
  try {
    const projDescStat = await workspace.fs.stat(resultFilePath);
    if (projDescStat.type !== FileType.File) {
      throw new Error(buildFileMissingMessage(resultFilePath));
    }
  } catch (error) {
    if (error instanceof FileSystemError && error.code === "FileNotFound") {
      throw new Error(buildFileMissingMessage(resultFilePath));
    }
    throw error;
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
  return isBuildPathUserError(error);
}

function logMonitorBaudFallback(reason: string) {
  const outputChnl = getOutputChannel();
  const message = `Using idfWeb.monitorBaudRate for monitor baud rate.\nReason ${reason}`;
  outputChnl.appendLine(message);
  window.showInformationMessage(message);
}

export async function getMonitorBaudRate(workspaceFolder?: Uri) {
  if (workspaceFolder) {
    const buildDir = await getBuildDirectoryUri(workspaceFolder);
    logUsingBuildPath(buildDir);
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
      logMonitorBaudFallback(
        error instanceof Error
          ? error.message
          : "project_description.json not found.",
      );
      return getConfiguredMonitorBaudRate();
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
  const buildDir = await getBuildDirectoryUri(workspaceFolder);
  logUsingBuildPath(buildDir);
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
