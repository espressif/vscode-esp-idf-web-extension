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

export function uInt8ArrayToString(fileBuffer: Uint8Array) {
  let fileBufferString = "";
  for (let i = 0; i < fileBuffer.length; i++) {
    fileBufferString += String.fromCharCode(fileBuffer[i]);
  }
  return fileBufferString;
}