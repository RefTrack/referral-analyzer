const electron = require('electron')
const app = electron.app
const BrowserWindow = electron.BrowserWindow
const ipc = electron.ipcMain
const analyzeIncome = require('./analyzeIncome')

const defaultOutputPath = app.getPath('documents') + "\\binance_consolidated_referrals.csv"

let lastTimestamp = 0


var win

require('electron-reload')(__dirname);

function createWindow () {
  // Create the browser window.
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true
    }
  })

  // and load the index.html of the app.
  win.removeMenu()
  win.loadFile('index.html')

}
  
// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.


const sendStatus = (message) => {
  win.webContents.send('new-status-message', message)
  console.log(`Status: ${message}`)
}

const sendProgressBarPercent = (percent) => {
  win.webContents.send('progress-bar-new-percentage', percent)
  // console.log(`New percentage: ${percent}`)
}

ipc.on('go', async (event, payload) => {
  await analyzeIncome(sendStatus, payload.arrayOfPaths, payload.interval, payload.outputPath, payload.filtersObj, payload.formatForCointrackingImport, sendProgressBarPercent)

  win.webContents.send('finished')
})

ipc.on('request-default-output-path', () => {
  win.webContents.send('new-output-path', defaultOutputPath)
})



ipc.on('save-as-clicked', async (event, outputPath) => {
  console.log('save-as-clicked event received by main process.')

  const options = {defaultPath: outputPath}
  const saveAsResult = await electron.dialog.showSaveDialog(null, options)
  if (saveAsResult.canceled == false) {
    win.webContents.send('new-output-path', saveAsResult.filePath)
  }
})








