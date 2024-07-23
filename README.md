# ESP-IDF-WEB Extension for Visual Studio Code

Web extension of ESP-IDF for serial communication.

## Features

Allow the user to flash and monitor with ESP-IDF Webserial esptool-js.

`ESP-IDF-Web Flash`: Command to flash binaries from selected workspace to selected serial port.

`ESP-IDF-Web Monitor`: Command to start a serial monitor terminal to selected serial port. (It requires)

## Test the extension

Run `yarn` to install dependencies

Run `yarn package` to generate the `esp-idf-web-extension.vsix` installer to install in Codespaces or so.

Run `yarn run-in-browser` to start a Chromium browser with Visual Studio Code running the extension. (Does not provide terminal).

You can also side load it into vscode.dev by following this [documentation](https://code.visualstudio.com/api/extension-guides/web-extensions#test-your-web-extension-in-vscode.dev).
