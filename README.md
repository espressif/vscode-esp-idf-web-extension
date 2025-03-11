# ESP-IDF-WEB Extension for Visual Studio Code and Codespaces

Web extension of ESP-IDF for serial communication using [esptool-js](https://github.com/espressif/esptool-js) such as flash and monitor Espressif devices.

How to use
----------

1. Open a workspace folder with an ESP-IDF project in CodeSpaces or VSCode Web.
2. IF you are using Codespaces Install the [ESP-IDF extension](https://marketplace.visualstudio.com/items?itemName=espressif.esp-idf-extension) from the Visual Studio Code Marketplace.
3. Install the [ESP-IDF Web Extension](https://marketplace.visualstudio.com/items?itemName=espressif.esp-idf-web) from the Visual Studio Code Marketplace.
4. The ESP-IDF Web extension will show a status bar flash icon and a monitor icon.
5. Press menu **View**, select **Command Palette...** and search for **ESP-IDF-Web Select serial port** command to select the serial port to use.
6. A serial port icon will appear in the status bar with the selected serial port. You can also just run **ESP-IDF-Web Flash** or **ESP-IDF-Web Monitor** commands and it will ask you for the serial port to use.

You can also configure a github ESP-IDF project for Codespaces with the ESP-IDF Web extension and the ESP-IDF extension installed by adding a `.devcontainer/devcontainer.json` file with the following content:

```JSON
  {
    "name": "ESP-IDF Codespaces",
    "build": {
      "dockerfile": "Dockerfile",
      "args": {
        "DOCKER_TAG": "v5.3-rc1"
      }
    },
    "customizations": {
      "vscode": {
        "settings": {
          "terminal.integrated.defaultProfile.linux": "bash",
          "idf.espIdfPath": "/opt/esp/idf",
          "idf.customExtraPaths": "",
          "idf.toolsPath": "/opt/esp",
          "idf.gitPath": "/usr/bin/git",
          "idf.showOnboardingOnInit": false,
          "extensions.ignoreRecommendations": true
        },
        "extensions": [
          "espressif.esp-idf-extension",
          "espressif.esp-idf-web"
        ]
      }
    },
    "runArgs": ["--privileged"]
  }
```

and a `.devcontainer/Dockerfile` file with the following content:

```DOCKERFILE
  ARG DOCKER_TAG=latest
  FROM espressif/idf:${DOCKER_TAG}

  RUN echo "source /opt/esp/idf/export.sh > /dev/null 2>&1" >> ~/.bashrc

  ENTRYPOINT [ "/opt/esp/entrypoint.sh" ]

  CMD ["/bin/bash", "-c"]
```

After adding these files, just open the project in Codespaces and the ESP-IDF Web extension will be installed and ready to use.

It might be necessary to manually install ESP-IDF-Web extension in Codespaces if it is not automatically installed.

## Commands

Press menu **View**, select **Command Palette...** and search for these commands:

`ESP-IDF-Web Flash`: Flash binaries from selected workspace to selected serial port. If no serial port was previously selected, it will ask the user for the serial port to use othewise use previously selected serial port.

`ESP-IDF-Web Monitor`: Start a serial monitor terminal connected to the selected serial port. If no serial port was previously selected, it will ask the user for the serial port to use othewise use previously selected serial port.

`ESP-IDF-Web Flash and Monitor`: Flash binaries from selected workspace folder to selected serial port and start a serial monitor terminal to selected serial port. If no serial port was previously selected, it will ask the user for the serial port to use othewise use previously selected serial port.

`ESP-IDF-Web Select serial port`: Show the list of available serial ports for previous commands. The selected serial port will saved and shown in the status bar icon and re used by this extension commands.

`ESP-IDF-Web Disconnect serial port`: Dispose of currently selected serial port. This command is executed when you click the serial port shown in the status bar.

> **NOTE:** The `ESP-IDF-Web Flash` command depends on `flasher_args.json` and the `ESP-IDF-Web Monitor` command depends on `project_description.json` from ESP-IDF project build directory, where the build directory is defined using `idf.buildPath` from [ESP-IDF extension VS Code](https://marketplace.visualstudio.com/items?itemName=espressif.esp-idf-extension) configuration setting or it will use the currently selected workspace folder `build` otherwise (`${workspaceFolder}/build`).

## Settings

`idfWeb.flashBaudRate`: Allow the user to set the flash baudrate being used to flash the current workspace folder ESP-IDF project application to your device.

`idfWeb.enableStatusBarIcons`: Show or hide the ESP-IDF Web extension status bar icons: (Selected serial port, Flash and Monitor icons). This setting can only be modified in User Settings.

For `ESP-IDF-Web Monitor` command, the baud rate used is determined from build directory's `project_description.json` field called `monitor_baud`.

## Test the extension

Run `yarn` to install dependencies

Run `yarn package` to generate the `esp-idf-web-extension.vsix` installer to install in Codespaces, Visual Studio Code or other compatibles IDEs.

Run `yarn run-in-browser <path-to-idf-project>` to start a Chromium browser with Visual Studio Code running the extension. (This environment does not provide a usable terminal).

You can also side load it into `vscode.dev` by following this [documentation](https://code.visualstudio.com/api/extension-guides/web-extensions#test-your-web-extension-in-vscode.dev).

## Known issues

WebSerial API doesn't identify currently selected serial port in the SerialPort information only USB ProductID and VendorID. More information in [here](https://github.com/WICG/serial/issues/128).
