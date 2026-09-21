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
import {
  stringToUInt8Array,
  uInt8ArrayToString,
  universalReset,
  sleep,
} from "./utils";

/**
 * IDF Monitor–style auto-coloring: inject ANSI codes by log level (E/W/I) so colors
 * work without CONFIG_LOG_COLORS on the device. Same regex as esp-idf-monitor.
 */
const IDF_LOG_LEVEL_REGEX = /^(I|W|E) \([\d.: -]+\)/;
// Incomplete header that could still become an IDF log header once more bytes arrive.
const IDF_LOG_HEADER_PREFIX_REGEX = /^[IWE](?: (?:\((?:[\d.: -]*\)?)?)?)?$/;
const ansi = {
  red: "\x1b[1;31m",
  green: "\x1b[0;32m",
  yellow: "\x1b[0;33m",
  normal: "\x1b[0m",
};

function describePort(transport: Transport): string {
  const info = transport.device.getInfo();
  const hex = (id: number | undefined) =>
    id === undefined ? "unknown" : `0x${id.toString(16).padStart(4, "0")}`;
  return `VID:${hex(info.usbVendorId)} PID:${hex(info.usbProductId)}`;
}

function idfLevelColor(line: string): string | undefined {
  const match = IDF_LOG_LEVEL_REGEX.exec(line);
  if (!match) {
    return undefined;
  }
  return match[1] === "E"
    ? ansi.red
    : match[1] === "W"
      ? ansi.yellow
      : ansi.green;
}

export class SerialTerminal implements Pseudoterminal {
  private writeEmitter = new EventEmitter<string>();
  public onDidWrite: Event<string> = this.writeEmitter.event;
  private closeEmitter = new EventEmitter<number>();
  public onDidClose: Event<number> = this.closeEmitter.event;
  public closed = false;
  private headerBuffer = "";
  private awaitingLevel = true;
  private activeColor: string | undefined;

  public constructor(protected transport: Transport) {}

  public async open(
    _initialDimensions: TerminalDimensions | undefined,
  ): Promise<void> {
    this.writeLine(
      `Opened ${describePort(this.transport)} with baud rate: ${this.transport.baudrate}`,
    );
    try {
      await sleep(100); // for JTAG on android
      // Start reading before resetting so the boot output is not missed and a
      // failing reset cannot keep the read loop from ever starting.
      const reading = this.transport.rawRead(
        (value) => this.writeSerialChunk(uInt8ArrayToString(value)),
        () => this.closed,
      );
      await universalReset(this.transport);
      await reading;
      this.flushSerialBuffer();
    } catch (error) {
      this.writeLine(
        `Monitor error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  public async close() {
    this.flushSerialBuffer();
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
    if (data.charCodeAt(0) === 18) {
      // CTRL + r
      universalReset(this.transport);
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

  protected writeSerialChunk(chunk: string): void {
    let text = this.headerBuffer + chunk;
    this.headerBuffer = "";
    while (text.length > 0) {
      if (this.awaitingLevel) {
        const lineEnd = text.indexOf("\n");
        const head = lineEnd === -1 ? text : text.slice(0, lineEnd);
        const color = idfLevelColor(head);
        if (
          !color &&
          lineEnd === -1 &&
          IDF_LOG_HEADER_PREFIX_REGEX.test(head)
        ) {
          // Hold only the few bytes needed to tell whether this line is an IDF log.
          this.headerBuffer = head;
          return;
        }
        if (color) {
          this.activeColor = color;
          this.writeOutput(color);
        }
        this.awaitingLevel = false;
      }
      const lineEnd = text.indexOf("\n");
      if (lineEnd === -1) {
        this.writeOutput(text);
        return;
      }
      this.writeOutput(text.slice(0, lineEnd));
      this.endColoredLine();
      this.writeOutput("\n");
      this.awaitingLevel = true;
      text = text.slice(lineEnd + 1);
    }
  }

  protected flushSerialBuffer(): void {
    if (this.headerBuffer.length > 0) {
      this.writeOutput(this.headerBuffer);
      this.headerBuffer = "";
      this.awaitingLevel = false;
    }
    this.endColoredLine();
  }

  private endColoredLine(): void {
    if (this.activeColor) {
      this.writeOutput(ansi.normal);
      this.activeColor = undefined;
    }
  }

  protected writeOutput(message: string): void {
    const output = message.replace(/\r/g, "").replace(/\n/g, "\r\n");
    this.writeEmitter.fire(output);
  }
}
