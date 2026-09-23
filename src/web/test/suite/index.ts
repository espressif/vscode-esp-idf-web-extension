// Imports mocha for the browser, defining the `mocha` global.
require("mocha/mocha");

const MOCHA_JSON_MARKER = "__MOCHA_JSON_REPORT__";

export function run(): Promise<void> {
  return new Promise((c, e) => {
    mocha.setup({
      ui: "tdd",
      reporter: "json",
      inlineDiffs: true,
    });

    // Bundles all files in the current directory matching `*.test`
    const importAll = (r: __WebpackModuleApi.RequireContext) =>
      r.keys().forEach(r);
    importAll(require.context(".", true, /\.test$/));

    try {
      const runner = mocha.run((failures) => {
        const results = (runner as { testResults?: unknown }).testResults;
        if (results) {
          console.log(MOCHA_JSON_MARKER + JSON.stringify(results));
        }
        if (failures > 0) {
          e(new Error(`${failures} tests failed.`));
        } else {
          c();
        }
      });
    } catch (err) {
      console.error(err);
      e(err);
    }
  });
}
