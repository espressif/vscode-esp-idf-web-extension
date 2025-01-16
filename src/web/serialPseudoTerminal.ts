/*
 * Project: ESP-IDF Web Extension
 * File Created: Wednesday, 19th June 2024 9:29:17 am
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
import {
  Event,
  EventEmitter,
  Pseudoterminal,
  TerminalDimensions,
  window,
} from "vscode";
import { uInt8ArrayToString,stringToUInt8Array } from "./utils";

export class SerialTerminal implements Pseudoterminal {
  private writeEmitter = new EventEmitter<string>();
  public onDidWrite: Event<string> = this.writeEmitter.event;
  private closeEmitter = new EventEmitter<number>();
  public onDidClose: Event<number> = this.closeEmitter.event;
  public closed = false;

  public constructor(protected transport: Transport) {}

  public async open(
    _initialDimensions: TerminalDimensions | undefined
  ): Promise<void> {
    await this.transport.sleep(500);
    await this.reset();
    while (!this.closed) {
      const readLoop = this.transport.rawRead();
      const { value, done } = await readLoop.next();
  
      if (done || !value) {
        break;
      }
      let valStr = uInt8ArrayToString(value);
      this.writeOutput(valStr);
    }
  }

  public async reset() {
    if (this.transport) {
      await this.transport.setDTR(false);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await this.transport.setDTR(true);
    }
  }

  public async close() {
    if (!this.closed) {
      this.closed = true;
      this.closeEmitter.fire(0);
    }
    if (this.transport.device.readable) {
      await this.transport.disconnect();
      await this.transport.waitForUnlock(1500);
    }
  }

  public handleInput(data: string): void {
    // CTRL + ] signal to close IDF Monitor
    if (data === "\u001D") {
      this.closeEmitter.fire(0);
    }
    const writer = this.transport.device.writable?.getWriter();
    if (writer) {
      writer.write(stringToUInt8Array(data));
      writer.releaseLock();
    } else {
      window.showErrorMessage("Unable to write to serial port");
    }
  }

  protected writeLine(message: string): void {
    this.writeOutput(`${message}\n`);
  }

  protected writeOutput(message: string): void {
    const output = message.replace(/\r/g, "").replace(/\n/g, "\r\n");
    this.writeEmitter.fire(output);
  }
}
