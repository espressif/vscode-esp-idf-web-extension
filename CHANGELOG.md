# Change Log

All notable changes to the ESP-IDF Web Extension for VS Code will be documented in this file.

## [0.0.5]

- Use `idfWeb.buildPath` for flash and monitor artifacts (empty default is `${workspaceFolder}/build`). See [PR #31](https://github.com/espressif/vscode-esp-idf-web-extension/pull/31).
- Support CH340 with WebUSB when `idfWeb.useWebUsbCh340` is set to true. See [PR #31](https://github.com/espressif/vscode-esp-idf-web-extension/pull/31).
- Add IDF Monitor Colors. See [PR #31](https://github.com/espressif/vscode-esp-idf-web-extension/pull/31).
- Allow the `ESP-IDF-Web Monitor` to run without a workspace folder and add a `idfWeb.monitorBaudRate` for fallback if no project_description.json or workspace folder is found. See [PR #31](https://github.com/espressif/vscode-esp-idf-web-extension/pull/31).
- Update esptool-js to v0.7.0 to support ESP32-S31 and newer chips that use GET_SECURITY_INFO to detect chips and fix monitor. See [PR #31](https://github.com/espressif/vscode-esp-idf-web-extension/pull/31).
- Adds `ESP-IDF-Web Erase flash` so users can wipe device flash over Web Serial. See [PR #32](https://github.com/espressif/vscode-esp-idf-web-extension/pull/32)

## [0.0.4]

- [Fix device disconnect callback](https://github.com/espressif/vscode-esp-idf-web-extension/pull/18) Thanks @archef2000
- [Add monitor input functionality use native api string conversion](https://github.com/espressif/vscode-esp-idf-web-extension/pull/19) Thanks @archef2000
- [Fix monitor opened message](https://github.com/espressif/vscode-esp-idf-web-extension/pull/20)
- [Fix JTAG Monitor add universal reset](https://github.com/espressif/vscode-esp-idf-web-extension/pull/21) Thanks @archef2000
- [Add How to use readme](https://github.com/espressif/vscode-esp-idf-web-extension/pull/22)
- [Add longer jtag reset time](https://github.com/espressif/vscode-esp-idf-web-extension/pull/24) Thanks @archef2000

## [0.0.3]

- [Webserial Polyfill with WebUSB](https://github.com/espressif/vscode-esp-idf-web-extension/pull/7) Thanks @archef2000
- [Fix Windows path](https://github.com/espressif/vscode-esp-idf-web-extension/pull/8)
- [Check status bar item before creating it](https://github.com/espressif/vscode-esp-idf-web-extension/pull/10)
- [Add Flash and monitor command](https://github.com/espressif/vscode-esp-idf-web-extension/pull/11)
- [Move Monitor as static class](https://github.com/espressif/vscode-esp-idf-web-extension/pull/13)

## [0.0.2]

- [Add port reuse and management, flash and monitor status bar icons](https://github.com/espressif/vscode-esp-idf-web-extension/pull/3)
- [Use idf.buildPath for build files with workspace build dir fallback](https://github.com/espressif/vscode-esp-idf-web-extension/pull/3)
- [Add flashBaudRate configuration setting](https://github.com/espressif/vscode-esp-idf-web-extension/pull/2)

## [0.0.1]

- Initial release
