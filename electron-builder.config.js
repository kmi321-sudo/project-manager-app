module.exports = {
  appId: 'com.workbuddy.projectmanager',
  productName: '專案管理',
  directories: { output: 'dist' },
  files: ['main.js', 'preload.js', 'renderer/**/*'],
  win: {
    target: ['portable', 'zip'],
    signAndEditExecutable: false,
    sign: async () => { /* 空签名，避免需要 wine */ }
  }
};
