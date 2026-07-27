const { build, Platform } = require('electron-builder');

build({
  targets: Platform.WIN.createTarget(['portable', 'zip']),
  config: {
    appId: 'com.workbuddy.projectmanager',
    productName: '專案管理',
    directories: { output: 'dist' },
    files: ['main.js', 'preload.js', 'renderer/**/*'],
    win: {
      target: ['portable', 'zip'],
      signAndEditExecutable: false,
      sign: async () => { /* 不签名，避免需要 wine */ }
    }
  }
}).then(() => console.log('BUILD_DONE')).catch((e) => { console.error(e); process.exit(1); });
