module.exports = {
  testDir: './tests',
  timeout: 45000,
  workers: 1,
  use: { launchOptions: { executablePath: '/opt/pw-browsers/chromium' }, headless: true },
  reporter: [['list']]
};
