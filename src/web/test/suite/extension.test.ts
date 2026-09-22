import * as assert from "assert";
import * as vscode from "vscode";
import { resolveBuildDirectoryUri } from "../../utils";

suite("Web Extension Test Suite", () => {
  const workspaceFolder = vscode.Uri.parse(
    "vscode-remote://codespaces+test/workspaces/uart_echo",
  );

  test("empty and undefined idfWeb.buildPath use workspaceFolder/build", () => {
    const expected = vscode.Uri.joinPath(workspaceFolder, "build").toString();
    assert.strictEqual(
      resolveBuildDirectoryUri(workspaceFolder, undefined).toString(),
      expected,
    );
    assert.strictEqual(
      resolveBuildDirectoryUri(workspaceFolder, "").toString(),
      expected,
    );
    assert.strictEqual(
      resolveBuildDirectoryUri(workspaceFolder, "   ").toString(),
      expected,
    );
  });

  test("relative idfWeb.buildPath is joined with the workspace folder", () => {
    assert.strictEqual(
      resolveBuildDirectoryUri(workspaceFolder, "build_prod").toString(),
      vscode.Uri.joinPath(workspaceFolder, "build_prod").toString(),
    );
  });

  test("${workspaceFolder}/build resolves relative to the workspace folder", () => {
    assert.strictEqual(
      resolveBuildDirectoryUri(
        workspaceFolder,
        "${workspaceFolder}/build",
      ).toString(),
      vscode.Uri.joinPath(workspaceFolder, "build").toString(),
    );
  });

  test("absolute POSIX idfWeb.buildPath keeps scheme and authority", () => {
    const resolved = resolveBuildDirectoryUri(workspaceFolder, "/custom/out");
    assert.strictEqual(resolved.scheme, workspaceFolder.scheme);
    assert.strictEqual(resolved.authority, workspaceFolder.authority);
    assert.strictEqual(resolved.path, "/custom/out");
  });
});
