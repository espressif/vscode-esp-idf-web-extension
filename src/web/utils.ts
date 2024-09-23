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

import { FileType, Uri, workspace } from "vscode";

export function uInt8ArrayToString(fileBuffer: Uint8Array) {
  let fileBufferString = "";
  for (let i = 0; i < fileBuffer.length; i++) {
    fileBufferString += String.fromCharCode(fileBuffer[i]);
  }
  return fileBufferString;
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

export function resolveVariables(
  configPath: string,
  scope: Uri
) {
  const regexp = /\$\{(.*?)\}/g; // Find ${anything}
  return configPath.replace(
    regexp,
    (match: string) => {
      if (scope && match.indexOf("workspaceFolder") > 0) {
        return scope.fsPath === "/" ? "": scope.fsPath;
      }
      return match;
    }
  );
}
