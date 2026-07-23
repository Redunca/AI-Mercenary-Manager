module.exports = function (config) {
  config.set({
    frameworks: ['jasmine'], // or whatever you use
    files: [
      // your test files here
    ],

    customLaunchers: {
      ChromeHeadlessWSL: {
        base: 'ChromeHeadless',
        flags: [
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-setuid-sandbox',
        ],
      },
    },

    browsers: ['ChromeHeadlessWSL'],

    singleRun: true,
  });
};
