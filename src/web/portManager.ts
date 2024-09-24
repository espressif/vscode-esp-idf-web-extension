/*
 * Project: ESP-IDF Web Extension
 * File Created: Tuesday, 24th September 2024 9:14:05 am
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

import { commands, StatusBarItem, window, workspace } from "vscode";
import { createStatusBarItem } from "./utils";

export async function getSerialPort() {
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
  return port;
}

export class IDFWebSerialPort {
  private static instance: SerialPort | undefined;
  public static statusBarItem: StatusBarItem | undefined;

  static async init() {
    if (!this.instance) {
      this.instance = await getSerialPort();
    }
    if (this.instance) {
      this.createStatusBarItem(this.instance);
      this.instance.addEventListener("disconnect", (port) => {
        this.instance = undefined;
        if (this.statusBarItem) {
          this.statusBarItem.dispose();
          this.statusBarItem = undefined;
        }
      });
    }
    return this.instance;
  }

  static exists() {
    return this.instance !== undefined;
  }

  static createStatusBarItem(instance: SerialPort) {
    const info = instance.getInfo();
    const name = `IDF-WEB USB Port VID:${
      info.usbVendorId || "Unknown Vendor"
    } - PID:${info.usbProductId || "Unknown Product"}`;
    this.statusBarItem = createStatusBarItem(
      `$(plug) ${name}`,
      "ESP-IDF-Web Disconnect serial port",
      "espIdfWeb.disposePort",
      100
    );
    const enableStatusBarIcons = workspace
      .getConfiguration("")
      .get("idfWeb.enableStatusBarIcons") as boolean;
    if (enableStatusBarIcons) {
      this.statusBarItem.show();
    }
  }

  static async disconnect() {
    if (this.instance) {
      if (this.instance.readable || this.instance.writable) {
        if (this.instance.writable?.locked) {
          window.showErrorMessage(
            "Can't disconnect serial port while flashing."
          );
          return;
        }
        if (this.instance.readable?.locked) {
          window.showErrorMessage(
            "Can't disconnect serial port while reading from serial port."
          );
          return;
        }
        await this.instance.close();
      }
      this.instance = undefined;
      if (this.statusBarItem) {
        this.statusBarItem.dispose();
        this.statusBarItem = undefined;
      }
    }
  }
}
