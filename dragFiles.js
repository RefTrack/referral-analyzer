const ipc = require('electron').ipcRenderer;

const VERSIONNUMBER = 2

const electronShell = require('electron').shell

let arrayOfPaths = []
let outputPath = ""

const fileTableRef = document.getElementById('file-table')
var fileTableBodyRef = fileTableRef.getElementsByTagName('tbody')[0]

let numOfUploadedFiles = 0


const versionCheck = async () => {

    const res = await fetch(`https://referral-analyzer-update-check-server.vercel.app/version-check`)

    if (!res.ok) {
        // console.log(res)

        const errorText = `Error retrieving${formattedDataDescriptionForError} data from Binance API: ${res.statusText}`

        // console.log(errorText)
        console.log(errorText)

        return

    }

    const payload = await res.json()

    if (payload.versionNumber > VERSIONNUMBER) {

        var updateModal = document.getElementById("update-modal");
        updateModal.classList.add("is-active");

        var updateModalTitle = document.getElementById("update-modal-title");
        updateModalTitle.innerHTML = payload.updateModalTitle

        var updateModalBody = document.getElementById("update-modal-body");
        updateModalBody.innerHTML = payload.updateModalBody

    } else {

        console.log("This version of the referral analyzer is up to date.")

    }
}

versionCheck()


// const linkClick = document.getElementById('cointracking-link')
// cointrackingLink.addEventListener('click', function () {

//     electronShell.openExternal('https://cointracking.info?ref=R317011')
//     // ipc.send('cointracking link clicked')
// })

linkClick = (d) => {
    const href = d.getAttribute('out_link')
    electronShell.openExternal(href)
}


const insertFileRow = (f) => {

    // Unhide the table
    fileTableRef.style.display = 'block'
    
    // Insert a row in the table at the last row
    var newRow   = fileTableBodyRef.insertRow();

    // Insert a cell in the row at index 0
    var newFilenameCell  = newRow.insertCell(0);

    // Append a text node to the cell
    var newFilenameText  = document.createTextNode(f.path);
    newFilenameCell.appendChild(newFilenameText);

    // Insert a cell in the row at index 1
    var newFilesizeCell  = newRow.insertCell(1);

    // Append a text node to the cell
    var newFilesizeText  = document.createTextNode(parseInt(f.size*0.001) + " KB");
    newFilesizeCell.appendChild(newFilesizeText);

}


var holder = document.getElementById('drag-file');

holder.ondragover = () => {
    return false;
};

holder.ondragleave = () => {
    return false;
};

holder.ondragend = () => {
    return false;
};

holder.ondrop = (e) => {
    e.preventDefault();

    for (let f of e.dataTransfer.files) {
        console.log('File(s) you dragged here: ', f.path)
        // console.log(f)
        arrayOfPaths.push(f.path)

        insertFileRow(f)
        numOfUploadedFiles++
    }

    document.getElementById('num-of-files-span').textContent = numOfUploadedFiles
    
    return false;
};



const goBtn = document.getElementById('go-btn')

goBtn.addEventListener('click', function () {

    console.log("Go button clicked")

    const interval = document.getElementById('interval-input').value
    const specificReferals = document.getElementById('specific-referrals-textarea').value
    const specificCurrencies = document.getElementById('specific-coins-textarea').value
    const startDate = document.getElementById('start-date').value
    const endDate = document.getElementById('end-date').value
    const formatForCointrackingImport = document.getElementById('do-import-radio').checked
    const leaderboardLength = document.getElementById('leaderboard-max-users').value
    const leaderboardCurrency = document.getElementById('leaderboard-currency').value
    


    let filtersObj = {
        specificReferals,
        specificCurrencies,
        startDate,
        endDate,
        leaderboardLength,
        leaderboardCurrency
    }

    if(document.getElementById('yes-leaderboard-radio').checked) {
        filtersObj.calculateLeaderboard = true

    } else {
        filtersObj.calculateLeaderboard = false
        // filtersObj.leaderboardLength = undefined
        // filtersObj.leaderboardCurrency = undefined
    }

    if(document.getElementById('include-radio').checked) {
        filtersObj.includeOrExcludeSpecificReferals = "include"
    } else {
        filtersObj.includeOrExcludeSpecificReferals = "exclude"
    }

    if(document.getElementById('coin-include-radio').checked) {
        filtersObj.includeOrExcludeSpecificCurrencies = "include"
    } else {
        filtersObj.includeOrExcludeSpecificCurrencies = "exclude"
    }



    payload = {
        arrayOfPaths,
        interval,
        outputPath,
        filtersObj,
        formatForCointrackingImport
    }

    document.getElementById('progress-bar').style.display = 'block'
    document.getElementById('status-messages').innerHTML = ""

    // const requestData = "test"
    ipc.send('go', payload)

})

document.getElementById('save-as-button').addEventListener('click', function () {

    console.log("Save As button clicked")

    ipc.send('save-as-clicked', outputPath)

})

ipc.on('new-output-path', (event, data) => {
    console.log("New output path received: ", data)
    outputPath = data
    document.getElementById('output-path-paragraph').textContent = outputPath

})

ipc.on('new-status-message', (event, data) => {

    //create new li element
    var newStatusMessageListItem = document.createElement("li");

    //create new text node
    var statusMessageTextNode = document.createTextNode(data);

    //add text node to li element
    newStatusMessageListItem.appendChild(statusMessageTextNode);

    //add new list element built in previous steps to unordered list
    //called numberList
    document.getElementById('status-messages').appendChild(newStatusMessageListItem);
    window.scrollTo(0, document.body.scrollHeight || document.documentElement.scrollHeight);

})

ipc.on('finished', (event, data) => {
    document.getElementById('progress-bar').style.display = 'none'
    document.getElementById('progress-bar-adjustable-div').style.display = 'none'
    document.getElementById('visible-progress-number').innerHTML = ``
})

ipc.on('progress-bar-new-percentage', (event, percentage) => {
    
    document.getElementById('progress-bar-adjustable-div').style.display = 'block'
    document.getElementById('progress-bar-adjustable').value = percentage
    document.getElementById('visible-progress-number').innerHTML = `${percentage}%`
    window.scrollTo(0, document.body.scrollHeight || document.documentElement.scrollHeight);
})

ipc.send('request-default-output-path')




