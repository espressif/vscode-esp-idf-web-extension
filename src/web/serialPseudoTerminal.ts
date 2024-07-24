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
} from "vscode";
import { uInt8ArrayToString } from "./utils";

export class SerialTerminal implements Pseudoterminal {
  private writeEmitter = new EventEmitter<string>();
  public onDidWrite: Event<string> = this.writeEmitter.event;
  private closeEmitter = new EventEmitter<number>();
  public onDidClose: Event<number> = this.closeEmitter.event;
  public closed = false;

  public constructor(
    protected transport: Transport,
    protected options: SerialOptions
  ) {}

  public async open(
    _initialDimensions: TerminalDimensions | undefined
  ): Promise<void> {
    await this.transport.sleep(500);
    await this.reset();
    while (!this.closed) {
      let val = await this.transport.rawRead();
      if (typeof val !== "undefined") {
        let valStr = uInt8ArrayToString(val);
        this.writeOutput(valStr);
      } else {
        break;
      }
    }

    this.transport.connect(this.options.baudRate, this.options);
    this.writeLine(`Opened with baud rate: ${this.options.baudRate}`);
  }

  public async reset() {
    if (this.transport) {
      await this.transport.setDTR(false);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await this.transport.setDTR(true);
    }
  }

  public async close() {
    await this.transport.waitForUnlock(1500);
    await this.transport.disconnect();
    if (!this.closed) {
      this.closed = true;
      this.closeEmitter.fire(0);
    }
  }

  public handleInput(data: string): void {
    this.writeLine("Input data is:");
    // CTRL + ] signal to close IDF Monitor
    if (data === "\u001D") {
      this.closeEmitter.fire(0);
    } else {
      this.writeOutput(data);
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
