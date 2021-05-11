const fs = require('fs')
const neatCsv = require('neat-csv')
const moment = require('moment')
const asyncForEach = require('./utils/asyncForEach')
const Decimal = require('decimal.js')
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fetch = require('node-fetch')
var hashwords = require('hashwords')


let totalRefEntries = 0
let oldProgress = 0
let priceDeterminationErrors = 0
let failedPricePairs = ""
let priceErrorsSuccessfullyResolvedInFuture = 0
let jumpedForwardPricePairs = ""

var sendProgressBarIpcMessage

let lastDateWhenRefPricesWereChecked = ""
let bnbbtcRefPrice = Decimal(0)
let bnbusdtRefPrice = Decimal(0)
let btcusdtRefPrice = Decimal(0)



var calculateLeaderboard
var leaderboardLength
var leaderboardCurrency

const maxRefEntriesToProcessAtOnce = 1000000
// const maxRefEntriesToProcessAtOnce = 50


// const csvPath = "C:\\Users\\SDT11\\Downloads\\referral income records for 2019\\"

// let btcCount = 0

// const csvHeaderInfo = ["Type", "Buy Amount", "Buy Currency", "Sell Amount", "Sell Currency", "Fee", "Fee Currency", "Exchange", "Trade-Group", "Comment", "Date"]

const csvHeaders = [
    {id: "Type", title: "Type"}, 
    {id: "Buy Amount", title: "Buy Amount"}, 
    {id: "Buy Currency", title: "Buy Currency"}, 
    {id: "Sell Amount", title: "Sell Amount"}, 
    {id: "Sell Currency", title: "Sell Currency"}, 
    {id: "Fee", title: "Fee"}, 
    {id: "Fee Currency", title: "Fee Currency"}, 
    {id: "Exchange", title: "Exchange"}, 
    {id: "Trade-Group", title: "Trade-Group"}, 
    {id: "Comment", title: "Comment"}, 
    {id: "Date", title: "Date"}
]

var ipcMain



let startTime = 0

const mark = () => {
    startTime = moment().valueOf()
}

const read = () => {
    const durationMs = moment().valueOf() - startTime

    return durationMs/1000
}

const timer = {
    mark,
    read
}






const progressBarUpdate = (count, indexOrRemaining) => {

    // console.log(totalRefEntries)
    let newProgress = 0

    if (indexOrRemaining == "index") {
        // newProgress = Math.round((count + 1)/totalRefEntries*100)
        // newProgress = Math.round((count + 1)/totalRefEntries*1000)/10
        newProgress = ((count + 1)/totalRefEntries*100).toFixed(1)
    } else if (indexOrRemaining == "remaining") {
        // newProgress = Math.round((totalRefEntries - count)/totalRefEntries*100)
        // newProgress = Math.round((totalRefEntries - count)/totalRefEntries*1000)/10
        newProgress = ((totalRefEntries - count)/totalRefEntries*100).toFixed(1)
    }
    // const newProgress = Math.round((totalRefEntries - refEntriesRemaining)/totalRefEntries*100)

    if (newProgress != oldProgress) {
        sendProgressBarIpcMessage(newProgress)
        // console.log(`New progress percentage: ${newProgress}%`)
        oldProgress = newProgress
    }

    // sendProgressBarIpcMessage()
}








function addMomentsAndDecimals(refEntry, index, dataArray) {

    // try {
    refEntry.momentTimestamp = moment.utc(refEntry.time)

    // Adding this to handle the date format used by BitFinex imports
    if (refEntry.momentTimestamp.format() == 'Invalid date') {
        refEntry.momentTimestamp = moment.utc(refEntry.time, "DD-MM-YY HH:mm:ss")
    }


    // the .replace command strips out any commas from the string.  Binance puts them into numbers denominated in the thousands, but it makes the Decimal package unhappy.
    refEntry.decimalAmount = Decimal(refEntry.delta.replace(/,/g, ''))

    dataArray[index] = refEntry

    progressBarUpdate(index, "index")
        // console.log(dataArray.length-(index+1))
    // } catch (e) {
    //     console.log("problem parsing this refEntry:")
    //     console.log(refEntry)
    //     throw(e)
    // }

    if (refEntry.momentTimestamp.format() == 'Invalid date') {
        console.log("problem parsing this timestamp: ", refEntry.time)
    }

    // if (refEntry.momentTimestamp.format() != 'Invalid date') {
    //     // console.log("problem parsing this refEntry:")
    //     // console.log(refEntry.timestamp)
    //     console.log("OK parsing this timestamp: ", refEntry.time)
    // }



}

const compareDateByMomentTimestamp = (refEntryA, refEntryB) => {

    if (refEntryA.momentTimestamp.isBefore(refEntryB.momentTimestamp)) {
        return -1
    } else {
        return 1
    }
}

const alphabetizeByCurrency = (refEntryA, refEntryB) => {
    if (refEntryA["Buy Currency"] < refEntryB["Buy Currency"]) {
        return -1
    } else {
        return 1
    }
}

const orderByBuyAmount = (refEntryA, refEntryB) => {
    if (refEntryA["Buy Amount"] > refEntryB["Buy Amount"]) {
        return -1
    } else {
        return 1
    }
}

const loadCsvToArray = async (path) => {
    const data = fs.readFileSync(path)
    const dataArray = await neatCsv(data)

    console.log(dataArray[dataArray.length - 1])
    console.log("Number of rows in CSV: ", dataArray.length)

    return dataArray
    
}

const loadAndCombineCSVs = async (arrayOfPaths) => {

    let allRefEntries = []

    await asyncForEach(arrayOfPaths, async (path, index, originalArray) => {

        console.log(`Now on CSV ${index+1} of ${originalArray.length}`)
        console.log("Loading CSV: ", path)
        const dataArray = await loadCsvToArray(path)
        allRefEntries = allRefEntries.concat(dataArray)

        // console.log((index + 1)/originalArray.length)
        sendProgressBarIpcMessage((((index + 1)/originalArray.length)*100).toFixed(1))
          
    })


    return allRefEntries
}

const consoleLogRefEntry = (thingToLog) => {

    if (Array.isArray(thingToLog)){
        thingToLog.forEach(function (refEntry, index, originalArray) {
            const momentTimestamp = refEntry.momentTimestamp
            delete refEntry.momentTimestamp
            console.log(refEntry)
            refEntry.momentTimestamp = momentTimestamp
        })
    } else {
        const momentTimestamp = thingToLog.momentTimestamp
        delete thingToLog.momentTimestamp
        console.log(thingToLog)
        thingToLog.momentTimestamp = momentTimestamp
    }

}


const buildTripwireArray = (interval, arrayOfRefs) => {

    const firstRefEntry = arrayOfRefs[0]
    const lastRefEntry = arrayOfRefs[arrayOfRefs.length-1]

    // console.log(arrayOfRefs[arrayOfRefs.length-1])
    // console.log(arrayOfRefs[arrayOfRefs.length-2])
    // console.log(arrayOfRefs[arrayOfRefs.length-3])
    // console.log(arrayOfRefs[arrayOfRefs.length-4])
    // console.log(arrayOfRefs[arrayOfRefs.length-5])
    // console.log(arrayOfRefs[arrayOfRefs.length-6])
    // console.log(arrayOfRefs[arrayOfRefs.length-7])
    // console.log(arrayOfRefs[arrayOfRefs.length-8])

    // const startYear = firstRefEntry.momentTimestamp.year()

    const startDate = moment.utc(`${firstRefEntry.momentTimestamp.format("YYYY-MM-DD")} 00:00:00`)

    console.log(`Start date: ${startDate.format()}`)
    console.log(`Last date: ${lastRefEntry.momentTimestamp.format()}`)
    
    let tripwireDateArray = [firstRefEntry.momentTimestamp.clone()]

    let newTripwire = startDate
    while (!newTripwire.isAfter(lastRefEntry.momentTimestamp)) {
        // console.log("Now on: ", newTripwire.format())
        newTripwire.add(interval, 'days')
        tripwireDateArray.push(newTripwire.clone())
        // console.log(newTripwire.format())

    }

    tripwireDateArray[tripwireDateArray.length-1] = lastRefEntry.momentTimestamp.clone()



    console.log("done generating tripwire date array")
    console.log(`first tripwire date is ${tripwireDateArray[0].format()}`)
    console.log(`second tripwire date is ${tripwireDateArray[1].format()}`)
    console.log(`last tripwire date is ${tripwireDateArray[tripwireDateArray.length-1].format()}`)
    return tripwireDateArray

}

const createOrAddToBalance = function(balanceObject, currencyOrUserID, amount) {

    if (typeof balanceObject[currencyOrUserID] != "undefined") {
        balanceObject[currencyOrUserID] = balanceObject[currencyOrUserID].add(amount)
        // balanceObject[currency] = balanceObject[currency]+amount

    } else {
        balanceObject[currencyOrUserID] = amount
    }

    // if (currency == "BTC") {
    //     btcCount++
    //     console.log(`${currency} earn: ${amount.toString()} // New total: ${balanceObject[currency].toString()} // count is ${btcCount}`)
    // }

    // return balanceObject
}

const convertConsolidatedIntervalObjToArray = (consolidatedIntervalObject, momentDate, previousTimestamp) => {

    let currentConsolidatedIntervalArray = []

    for (var currency in consolidatedIntervalObject) {
        // console.log(`${currency}: ${consolidatedIntervalObject[currency].toString()}`)
        var consolidatedRefEntry


        if (!calculateLeaderboard) {
            consolidatedRefEntry = {
                "Type": "Income",
                "Buy Amount": consolidatedIntervalObject[currency].toString(),
                "Buy Currency": currency,
                "Exchange": "Binance",
                "Comment": `Binance referral income from ${previousTimestamp.format('YYYY-MM-DD')} to ${momentDate.subtract(1, 'milliseconds').format('YYYY-MM-DD')}, computed with Binance Referral Analyzer`,
                "Date": momentDate.format('YYYY-MM-DD HH:mm:ss')
            }
        } else {

            var hw = hashwords()
            const nickname = hw.hashStr(currency)

            consolidatedRefEntry = {
                "User ID": currency,
                "Nickname": nickname,
                "Buy Amount": consolidatedIntervalObject[currency].toString(),
                "Comment": `Binance referral income from ${previousTimestamp.format('YYYY-MM-DD')} to ${momentDate.subtract(1, 'milliseconds').format('YYYY-MM-DD')}, computed with Binance Referral Analyzer`,
                "Date": momentDate.format('YYYY-MM-DD HH:mm:ss')
            }
        }

        currentConsolidatedIntervalArray.push(consolidatedRefEntry)
    }

    if (!calculateLeaderboard) {
        const currentConsolidatedIntervalArrayAlphabetized = currentConsolidatedIntervalArray.sort(alphabetizeByCurrency)
        currentConsolidatedIntervalArrayAlphabetized.push([])

        console.log("Consolidated interval added")
        return currentConsolidatedIntervalArrayAlphabetized
    } else {
        currentConsolidatedIntervalArray = currentConsolidatedIntervalArray.sort(orderByBuyAmount)
        // currentConsolidatedIntervalArray.push({"Date": momentDate.format('YYYY-MM-DD HH:mm:ss')})
        currentConsolidatedIntervalArray.push([])
        return currentConsolidatedIntervalArray
    }
}

const consolidateToInterval = (arrayOfRefs, interval, recordPrices) => {

    const tripewireDateArray = buildTripwireArray(interval, arrayOfRefs)

    let arrayOfConsolidations = []
    let currentIntervalConsolidationsObj = {}
    let previousTripwire = tripewireDateArray.shift()
    let currentTripwire = tripewireDateArray[0]
    

    while (arrayOfRefs.length > 0) {

        const ref = arrayOfRefs.shift()
        

        if (!ref.momentTimestamp.isSameOrBefore(currentTripwire) && arrayOfRefs.length > 0) {
            // arrayOfConsolidations = arrayOfConsolidations.concat(currentIntervalConsolidations)
            
            // console.log(`Current tripwire: ${currentTripwire.format()}`)
            console.log(`Interval complete (${currentTripwire.format()})`)

            if (calculateLeaderboard) {
                currentIntervalConsolidationsObj = sortAndTrimCurrentInterval(currentIntervalConsolidationsObj)
            }

            // console.log(`Interval complete (${currentTripwire.format()}) with ${currentIntervalConsolidationsObj.length} currencies`)
            arrayOfConsolidations = arrayOfConsolidations.concat(convertConsolidatedIntervalObjToArray(currentIntervalConsolidationsObj, currentTripwire, previousTripwire))
            currentIntervalConsolidationsObj = {}

            while (ref.momentTimestamp.isAfter(currentTripwire)) {
                previousTripwire = currentTripwire.clone()
                currentTripwire = tripewireDateArray.shift()
            }
            
            try {
                console.log(`Now on interval ${currentTripwire.format()}`)
            } catch (e) {
                console.log(ref.momentTimestamp.format())
                console.log(previousTripwire.format())
                throw(e)
            }
            
            // console.log(`Previous tripwire: ${previousTripwire.format()}`)
        }

        var assetOrUserID
        const amount = ref.decimalAmount

        if (!calculateLeaderboard) {
            assetOrUserID = ref.asset
        } else {

            const refObjectKeys = Object.keys(ref)
            const parentIDkey = refObjectKeys[0]

            if (ref[parentIDkey]) {
                assetOrUserID = ref[parentIDkey]
            } else if (ref.user_id) {
                assetOrUserID = ref.user_id
                // console.log(`user ID: ${ref.user_id}`)
                // console.log(`parent ID found: ${ref.parent_id}`)
            } else {
                assetOrUserID = "no parent_id or user_id found"
            }
        }

        createOrAddToBalance(currentIntervalConsolidationsObj, assetOrUserID, amount)
        

        progressBarUpdate(arrayOfRefs.length, "remaining")


    }

    if (calculateLeaderboard) {
        currentIntervalConsolidationsObj = sortAndTrimCurrentInterval(currentIntervalConsolidationsObj)
    }

    arrayOfConsolidations = arrayOfConsolidations.concat(convertConsolidatedIntervalObjToArray(currentIntervalConsolidationsObj, currentTripwire, previousTripwire))
    currentIntervalConsolidationsObj = {}

    return arrayOfConsolidations

}


const sortAndTrimCurrentInterval = (objectToSortAndTrim) => {
    
    // from https://stackoverflow.com/questions/1069666/sorting-object-property-by-values
    
    var sortable = [];
    for (var item in objectToSortAndTrim) {
        sortable.push([item, objectToSortAndTrim[item]]);
    }
    
    sortable.sort(function(a, b) {
        return b[1] - a[1];
    });

    // Trim leaderboard according to spec
    sortable = sortable.slice(0,leaderboardLength)

    var objSortedAndTrimmed = {}
    sortable.forEach(function(item){
        objSortedAndTrimmed[item[0]]=item[1]
    })

    return objSortedAndTrimmed
}

const writeToCsvFile = async (path, consolidatedRefs, formatForCointrackingImport) => {

    let csvHeaders = []

    if (formatForCointrackingImport) {
        if (!calculateLeaderboard){
            csvHeaders = [
                {id: "Type", title: "Type"}, 
                {id: "Buy Amount", title: "Buy Amount"}, 
                {id: "Buy Currency", title: "Buy Currency"}, 
                {id: "Sell Amount", title: "Sell Amount"}, 
                {id: "Sell Currency", title: "Sell Currency"}, 
                {id: "Fee", title: "Fee"}, 
                {id: "Fee Currency", title: "Fee Currency"}, 
                {id: "Exchange", title: "Exchange"}, 
                {id: "Trade-Group", title: "Trade-Group"}, 
                {id: "Comment", title: "Comment"}, 
                {id: "Date", title: "Date"}
            ]
        } else {
            csvHeaders = [
                {id: "Date", title: "Date"},
                {id: "User ID", title: "User ID"}, 
                {id: "Nickname", title: "Nickname"}, 
                {id: "Buy Amount", title: "Buy Amount"}, 
                {id: "Comment", title: "Comment"}
            ]
            
        }
    } else {
        if (!calculateLeaderboard) {
            csvHeaders = [
                {id: "Date", title: "Date"},
                {id: "Buy Currency", title: "Buy Currency"}, 
                {id: "Buy Amount", title: "Buy Amount"}, 
                {id: "Contemporary BTC Value", title: "Contemporary BTC Value"},
                {id: "Contemporary BNB Value", title: "Contemporary BNB Value"},
                {id: "Contemporary USDT Value", title: "Contemporary USDT Value"},
                {id: "Comment", title: "Comment"}, 
            ]
        } else {
            csvHeaders = [
                {id: "Date", title: "Date"},
                {id: "User ID", title: "User ID"}, 
                {id: "Nickname", title: "Nickname"}, 
                {id: "Buy Amount", title: "Buy Amount"}, 
                {id: "Contemporary BTC Value", title: "Contemporary BTC Value"},
                {id: "Contemporary BNB Value", title: "Contemporary BNB Value"},
                {id: "Contemporary USDT Value", title: "Contemporary USDT Value"},
                {id: "Comment", title: "Comment"}, 
            ]

        }
    }

    // if (includesPrices) {
    //     csvHeaders.push({id: "Contemporary BTC Value", title: "Contemporary BTC Value"})
    //     csvHeaders.push({id: "Contemporary BNB Value", title: "Contemporary BNB Value"})
    //     csvHeaders.push({id: "Contemporary USDT Value", title: "Contemporary USDT Value"})
    // }

    const csvWriter = createCsvWriter({
        path: path,
        header: csvHeaders
    });

    console.log("now writing...")
    await csvWriter.writeRecords(consolidatedRefs)

    console.log("Done writing")

    // return

}


const filterRefArray = (refArray, filtersObj) => {

    let entriesRemoved = 0

    const startDate = moment.utc(filtersObj.startDate)
    const endDate = moment.utc(filtersObj.endDate)

    console.log("Start Date: ", startDate.format())
    console.log("End Date: ", endDate.format())

    console.log()

    if (filtersObj.startDate != "" || filtersObj.endDate != "") {
        console.log("Doing filtering by date.")
    }

    // Remove all spaces and split into an array
    const specificCurrenciesArray = filtersObj.specificCurrencies.replace(/\s/g, "").toUpperCase().split(',')
    console.log("filtering coins: ", specificCurrenciesArray)

    // Remove all spaces and asterisks, and split into an array. I remove the asteriks because Binance seems inconsistent about the number of asterisks it inserts.
    const specificReferralsArray = filtersObj.specificReferals.replace(/\*/g, "").replace(/\s/g, "").toLowerCase().split(",")
    console.log("filtering emails: ", specificReferralsArray)

    // Remove all spaces and split into an array
    const specificCodesArray = filtersObj.specificCodes.replace(/\s/g, "").toUpperCase().split(',')
    console.log("filtering codes: ", specificCodesArray)

    console.log("BNB is filtered: ", specificCurrenciesArray.includes("BNB"))

    const filteredArray = refArray.filter( (refEntry, index, originalArray) => {

        if (filtersObj.startDate != "" || filtersObj.endDate != "") {

            if(refEntry.momentTimestamp.isBefore(startDate)) {
                return false
            }

            
            if(refEntry.momentTimestamp.isAfter(endDate)) {
                return false
            }
    
        }

        if (filtersObj.includeOrExcludeSpecificCurrencies == "exclude") {

            if (specificCurrenciesArray.includes(refEntry.asset)) {
                entriesRemoved++
                return false
            }
            
        } else {

            if (!specificCurrenciesArray.includes(refEntry.asset)) {
                entriesRemoved++
                return false
            }

        }

        if (filtersObj.includeOrExcludeSpecificCodes == "exclude") {

            if (specificCodesArray.includes(refEntry.referral_code)) {
                entriesRemoved++
                return false
            }
            
        } else {

            if (!specificCodesArray.includes(refEntry.referral_code)) {
                entriesRemoved++
                return false
            }

        }



        if (filtersObj.includeOrExcludeSpecificReferals == "exclude") {

            if (refEntry.email) {
                if (specificReferralsArray.includes(refEntry.email.replace(/\*/g, "").replace(/\s/g, ""))) {
                    entriesRemoved++
                    return false
                }
            } else if (refEntry.user_id) {
                if (specificReferralsArray.includes(refEntry.user_id.replace(/\*/g, "").replace(/\s/g, ""))) {
                    entriesRemoved++
                    return false
                }
            }

            
            
        } else {

            if (refEntry.email) {
                if (!specificReferralsArray.includes(refEntry.email.replace(/\*/g, "").replace(/\s/g, ""))) {
                    entriesRemoved++
                    return false
                }
            } else if (refEntry.user_id) {
                if (!specificReferralsArray.includes(refEntry.user_id.replace(/\*/g, "").replace(/\s/g, ""))) {
                    entriesRemoved++
                    return false
                }
            }
            
        }

        progressBarUpdate(index, "index")

        return true
    })

    console.log(`*** ${entriesRemoved} entries filtered out`)
    return filteredArray

}

function sleep_ms(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetch_url(requestUrl, sleep, attempts) {
    let result = { ok: 1, res: {} }

    for (i = 0; (result.ok != 0) && (i < attempts); i++) {
        try {
            await sleep_ms(sleep) // Throttle ourselves
            let response = await fetch(requestUrl)
            result = { ok: 0, error: {}, res: response }
        } catch(e) {
            console.log(`Attempt ${i}: error during price retrieval, result:`)
            result = { ok: e.code, error: e, res: {} }
            console.dir(result)
        }
    }
    return result
}

async function fetch_json(requestUrl, sleep) {
    let responseStatusCode
    let res

    // console.log(`fetch_json:+ resultestUrl=${requestUrl} sleep=${sleep}`)
    let result = await fetch_url(requestUrl, sleep, 2)

    if (result.ok != 0) {
        return { "msg" : "Invalid symbol." }
    }
    res = result.res
    responseStatusCode = res.status

    // console.log(responseStatusCode)

    if (responseStatusCode == 429 || responseStatusCode == 418) {
        throw(`Binance has rate-limited or banned this IP address. Binance API response code: `, responseStatusCode)
    }

    if (responseStatusCode != 200 && responseStatusCode.toString()[0] != "4") {
        console.log("Something went wrong during price retrieval, result:")
        console.dir(result)
        throw( new Error(`Hmm... something went wrong while retrieving price data from Binance.  It might be a problem with this app, or it might be that the Binance API is down for maintenance right now.  I'd recommend trying again in a little while.  Here's the HTTP error code that Binance reported: [[ ${res.status} ]] // [[ ${res.statusText} ]].  Request URL: ${requestUrl}`))
    }

    // Return json which maybe maybe zero length
    return res.json();
}

const getHistoricalValue = async (amount, currency, valueInCurrency, startTime, duration) => {
    // console.log(`getHistoricalValue:+ ${amount}, ${currency}, ${valueInCurrency}, ${startTime}, ${duration}`)
    const sleep = 2000

    let symbolIsFlipped = false
    let symbol = currency + valueInCurrency
    // console.log(symbol)

    if (currency == valueInCurrency) {
        // console.log(`getHistoricalValue:- currency == valueInCurrency return ${amount}`)
        return amount
    }

    let endTime = startTime + duration
    let requestUrl = `https://www.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&startTime=${startTime}&endTime=${endTime}`

    let json = await fetch_json(requestUrl, sleep);
    if ((json.length == 0) || (json.msg == "Invalid symbol.")) {
        // console.log("No data or Invalid symbol!  Will try to reverse the symbol...")

        symbol = valueInCurrency + currency
        
        requestUrl = `https://www.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&startTime=${startTime}&endTime=${endTime}`
        json = await fetch_json(requestUrl, sleep)
        // console.log(json)

        symbolIsFlipped = true
    }

    let value = "0"
    if (json.msg == "Invalid symbol.") {
        // No such symbol forward or reverse
        console.log(`getHistoricalValue: ${symbol} Invalid symbol`)
        value = "0"
    } else if (json.length < 1) {
        // No data
        console.log(`getHistoricalValue: ${symbol} No data`)
        value = "0"
    } else if (json[0].length < 12) {
        // Incorrect size
        console.log(`getHistoricalValue: ${symbol} Incorrect size of returned data`)
        value = "0"
    } else {
        // Get klineData and then the start or close as desired
        // TODO: Allow user to select starting/closing/high/low or ....
        const klineData = json[0]
        // console.log(`getHistoricalValue: startingPrice=${klineData[1]} closingPrice=${klineData[4]}`)
        // const priceDec = Decimal(klineData[1]) // Starting Price
        const priceDec = Decimal(klineData[4]) // Closing Price

        if (!symbolIsFlipped) {
            const priceInTargetCurrency = priceDec.times(amount)
            value = priceInTargetCurrency.toDecimalPlaces(8).toString()
        } else {
            const priceInTargetCurrency = Decimal(amount).dividedBy(priceDec)
            value = priceInTargetCurrency.toDecimalPlaces(8).toString()
        }
    }

    // console.log(`getHistoricalValue:- return ${value}`)
    return value
}

const lookForwardForHistoricalValue = async (amount, currency, valueInCurrency, startTime, attempts) => {
    const hoursToAdd = 24
    let goForwardAttempts = 0
    let duration = hoursToAdd*3600000
    let value = 0
    while (value == 0 && goForwardAttempts <= attempts) {
        startTime = startTime + duration
        let date = new Date(startTime).toUTCString()

        console.log(`Trying to jump forward on symbol ${currency} in ${valueInCurrency} for date ${date}, forward to ${moment.utc(startTime).format()}. This is jump-forward attempt #${goForwardAttempts}`)
        value = await getHistoricalValue(amount, currency, valueInCurrency, startTime, duration)

        goForwardAttempts++

        if (value != 0) {
            priceErrorsSuccessfullyResolvedInFuture++
            jumpedForwardPricePairs = jumpedForwardPricePairs + `${currency} in ${valueInCurrency} for ${date} jumped forward to ${moment.utc(startTime).format()}, `
        }
        //console.log(json)
    }

    return value
}

async function addPriceToArray (arrayEntry, index, dataArray) {

    // get BTC/USD price for this date, unless we have it already
    // get ETH/BTC price for this date, unless we have it already
    // get BTC price for this asset for this date

    if (typeof arrayEntry["Buy Currency"] != 'undefined' || typeof arrayEntry["User ID"] != 'undefined') {

        const currency = leaderboardCurrency || arrayEntry["Buy Currency"]
        const date = arrayEntry["Date"]
        const amount = arrayEntry["Buy Amount"]

        // starTime and duration in milli-seconds
        const startTime = moment.utc(date).valueOf()
        const duration = 60000
        if (date != lastDateWhenRefPricesWereChecked) {
            console.log("New date series.  Getting new reference pricing info for: ", date)
            bnbbtcRefPrice = await getHistoricalValue(1, "BNB", "BTC", startTime, duration)
            console.log(`BNBBTC ref price for ${date}: ${bnbbtcRefPrice}`)
            bnbusdtRefPrice = await getHistoricalValue(1, "BNB", "USDT", startTime, duration)
            console.log(`BNBUSDT ref price for ${date}: ${bnbusdtRefPrice}`)
            btcusdtRefPrice = await getHistoricalValue(1, "BTC", "USDT", startTime, duration)
            console.log(`BTCUSDT ref price for ${date}: ${btcusdtRefPrice}`)
            lastDateWhenRefPricesWereChecked = date
            if (priceErrorsSuccessfullyResolvedInFuture != 0 || priceDeterminationErrors != 0) {
                console.log(`Prices resolved in future: `, priceErrorsSuccessfullyResolvedInFuture)
                console.log(`Pairs resolved in future so far : `, jumpedForwardPricePairs)
                console.log(`Price determination errors so far: `, priceDeterminationErrors)
                console.log(`Failed price pairs so far: `, failedPricePairs)
            }
        }


        var contempUsdtValue = 0
        var contempBtcValue = 0

        contempBtcValue = await getHistoricalValue(amount, currency, "BTC", startTime, duration)
        if (contempBtcValue == 0) {
            contempUsdtValue = await getHistoricalValue(amount, currency, "USDT", startTime, duration)
        }
        if (contempBtcValue == 0 && contempUsdtValue == 0) {
            // Try to look up forward values
            const attempts = 4
            contempBtcValue = await lookForwardForHistoricalValue(amount, currency, "BTC", startTime, attempts)
            if (contempBtcValue == 0) {
                contempUsdtValue = await lookForwardForHistoricalValue(amount, currency, "USDT", startTime, attempts)
            }
        }

        if (contempBtcValue != 0) {
            console.log(`${currency} amount=${amount} btcValue=${contempBtcValue} for ${date}`)
            arrayEntry["Contemporary BTC Value"] = contempBtcValue
            if (bnbbtcRefPrice != 0) {
                arrayEntry["Contemporary BNB Value"] = Decimal(contempBtcValue).dividedBy(bnbbtcRefPrice).toDecimalPlaces(8).toString()
            } else {
                arrayEntry["Contemporary BNB Value"] = 0
            }
            arrayEntry["Contemporary USDT Value"] = Decimal(contempBtcValue).times(btcusdtRefPrice).toDecimalPlaces(8).toString()
        } else if (contempUsdtValue != 0) {
            console.log(`${currency} amount=${amount} usdtValue=${contempUsdtValue} for ${date}`)
            arrayEntry["Contemporary USDT Value"] = contempUsdtValue
            if (btcusdtRefPrice != 0) {
                arrayEntry["Contemporary BTC Value"] = Decimal(contempUsdtValue).dividedBy(btcusdtRefPrice).toDecimalPlaces(8).toString()
            } else {
                    arrayEntry["Contemporary BTC Value"] = 0
                }
            if (bnbusdtRefPrice != 0) {
                arrayEntry["Contemporary BNB Value"] = Decimal(contempUsdtValue).dividedBy(bnbusdtRefPrice).toDecimalPlaces(8).toString()
            } else {
                arrayEntry["Contemporary BNB Value"] = 0
            }
        } else {
            console.log(`${currency} amount=${amount} no reference price all values are 0 for ${date}`)
            arrayEntry["Contemporary BTC Value"] = 0
            arrayEntry["Contemporary BNB Value"] = 0
            arrayEntry["Contemporary USDT Value"] = 0
        }

        if ((arrayEntry["Contemporary BTC Value"] == 0) && (arrayEntry["Contemporary BNB Value"] == 0) && (arrayEntry["Contemporary USDT Value"] == 0)) {
            console.log(`No pricing info for symbol: ${currency} on date: ${date}. This tool will pretend that the price was zero. Binance did not return any pricing data for this item, including for several days into the future.`)
            priceDeterminationErrors++
            failedPricePairs = failedPricePairs + `${currency} for ${date}, `
        }
        // arrayEntry.ethPrice = 0
        // arrayEntry.usdPrice = 0

        dataArray[index] = arrayEntry

        progressBarUpdate(index, "index")
    }
}




const reduceLeaderboard = (consolidatedRefs) => {

}




const analyzeIncome = async (sendStatus, arrayOfPaths, interval, outputPath, filtersObj, formatForCointrackingImport, sendProgressBarPercent) => {



    try {

        // const errorProducer = undefined
        // console.log(errorProducer[1])

        calculateLeaderboard = filtersObj.calculateLeaderboard
        leaderboardLength = filtersObj.leaderboardLength || 100000
        leaderboardCurrency = filtersObj.leaderboardCurrency.toUpperCase()

        sendProgressBarIpcMessage = sendProgressBarPercent
        priceDeterminationErrors = 0
        failedPricePairs = ""
        priceErrorsSuccessfullyResolvedInFuture = 0
        jumpedForwardPricePairs = ""


        let modifiedFiltersObj = filtersObj

        if (calculateLeaderboard) {
            modifiedFiltersObj.specificCurrencies = leaderboardCurrency
            modifiedFiltersObj.includeOrExcludeSpecificCurrencies = "include"
        }
        
        
        sendStatus("Beginning analysis...")
        console.log("Paths: ", arrayOfPaths)
        console.log("Interval (days): ", interval)
        sendStatus(`Output path: ${outputPath}`)
        console.log("Filters: ", modifiedFiltersObj)

        sendStatus('Loading CSVs...')
        timer.mark()
        let allRefEntries = await loadAndCombineCSVs(arrayOfPaths)
        sendStatus(`CSVs loaded in ${timer.read()} seconds`)

        sendStatus(`Number of income entries loaded: ${allRefEntries.length}`)

        totalRefEntries = allRefEntries.length

        if (allRefEntries.length == 0) {
            sendStatus('No income entries found. Perhaps something went wrong during the CSV import?')
            return
        }


        let semiConsolidatedRefs = []
        let fullyConsolidatedRefs = []
        let consolidationRounds = 0
        let consolidationsNeeded = Math.ceil(allRefEntries.length/maxRefEntriesToProcessAtOnce)
        let nowSuperconsolidating = false

        while (allRefEntries.length > 0) {

            consolidationRounds++

            if (consolidationsNeeded > 1) {

                if (consolidationRounds == 1) {
                    sendStatus(`Wow, that's a lot of data! If we try to process more than ${maxRefEntriesToProcessAtOnce} at once, the tool will sometimes crash.  So we'll divide this import into ${consolidationsNeeded} parts, consolidate each, and then perform a super-consolidation.`)
                }

                sendStatus(`Now in consolidation ${consolidationRounds} of ${consolidationsNeeded}`)
            }

            let refsForThisRound = allRefEntries.splice(0,maxRefEntriesToProcessAtOnce)
            totalRefEntries = refsForThisRound.length

            console.log(refsForThisRound.length)
            console.log(refsForThisRound[0])
            console.log(refsForThisRound[refsForThisRound.length-1])

            let timestampsNotAddedYet = true
            if (modifiedFiltersObj.startDate != "" || modifiedFiltersObj.endDate != "") {

                console.log('Adding Moment timestamps and Decimals...')
                sendStatus("Parsing dates and amounts...")
                timer.mark()
                refsForThisRound.forEach(addMomentsAndDecimals)
                console.log(`Timestamps/Decimals added in ${timer.read()} seconds`)
                sendStatus(`Dates/amounts parsed in ${timer.read()} seconds`)
                timestampsNotAddedYet = false

            }


            if (modifiedFiltersObj.specificCodes.length > 0 || modifiedFiltersObj.specificCurrencies.length > 0 || modifiedFiltersObj.specificReferals.length > 0  || modifiedFiltersObj.startDate != "" || modifiedFiltersObj.endDate != "") {
                
                if (!nowSuperconsolidating) {
                    sendStatus('Applying filter(s)...')
                    timer.mark()
                    refsForThisRound = filterRefArray(refsForThisRound, modifiedFiltersObj)
                    sendStatus(`Filtered in ${timer.read()} seconds`)
                    sendStatus(`${refsForThisRound.length} income entries remaining after filtering. (${(refsForThisRound.length/totalRefEntries*100).toFixed(4)}% of original)`)
                    // sendStatus(`${Math.round((refsForThisRound.length/totalRefEntries).toFixed(4))}% of income entries remaining after filtering`)
    
                    totalRefEntries = refsForThisRound.length
                }
            }
            // console.log(`Final 2 ref entries:`)

            if (timestampsNotAddedYet) {

                console.log('Adding Moment timestamps and Decimals...')
                sendStatus("Parsing dates and amounts...")
                timer.mark()
                refsForThisRound.forEach(addMomentsAndDecimals)
                console.log(`Timestamps/Decimals added in ${timer.read()} seconds`)
                sendStatus(`Dates/amounts parsed in ${timer.read()} seconds`)

            }

            sendStatus('Sorting by date...')
            timer.mark()
            refsForThisRound.sort(compareDateByMomentTimestamp)
            sendStatus(`Sorted in ${timer.read()} seconds`)
            console.log("Final referral income entry:")
            consoleLogRefEntry(refsForThisRound[refsForThisRound.length - 1])

            sendStatus("Consolidating to intervals...")
            timer.mark()
            const consolidatedRefsForThisRound = consolidateToInterval(refsForThisRound, interval)
            sendStatus(`Consolidated in ${timer.read()} seconds`)
            // console.log(consolidatedRefs)

            semiConsolidatedRefs = semiConsolidatedRefs.concat(consolidatedRefsForThisRound)

            if (allRefEntries.length == 0 && consolidationRounds > 1) {

                sendStatus(`Entering super-consolidation with ${semiConsolidatedRefs.length} entries to super-consolidate.`)

                semiConsolidatedRefs.forEach( element => {
                    // This if-statement checks to make sure this isn't a 'whitespace' line in the export between two dates.
                    if (element["Buy Amount"]) {
                        const simplifiedEntry = {
                            user_id: 0,
                            time: element["Date"],
                            delta: element["Buy Amount"],
                            asset: element["Buy Currency"]
                        }
                        allRefEntries.push(simplifiedEntry)
                    }
                })

                semiConsolidatedRefs = []

                consolidationsNeeded = Math.ceil(allRefEntries.length/maxRefEntriesToProcessAtOnce)
                consolidationRounds = 0
                nowSuperconsolidating = true

            }
            
        }

        fullyConsolidatedRefs = semiConsolidatedRefs

        totalRefEntries = fullyConsolidatedRefs.length

        if (fullyConsolidatedRefs.length == 0) {
            sendStatus('No income left after filtering!  Ending here.  Try specifying looser filters.')
            return
        }


        if (calculateLeaderboard) {

        }
        

        if (!formatForCointrackingImport) {
            totalRefEntries = fullyConsolidatedRefs.length
            sendStatus("Retrieving/adding price data...")
            timer.mark()
            await asyncForEach(fullyConsolidatedRefs, addPriceToArray)
            sendStatus(`Prices added in ${timer.read()} seconds`)


            let message = `There were ${priceErrorsSuccessfullyResolvedInFuture} times that the tool couldn't determine a price on the requested date, but for which the tool found a price at some point in the future.`
            sendStatus(message)
            fullyConsolidatedRefs.push({"Comment": message})

            if (priceErrorsSuccessfullyResolvedInFuture != 0) {
                // sendStatus(`WARNING: That might reduce accuracy.`)
                
                message = `These are the pairs that had to be priced in the future: ${jumpedForwardPricePairs}`
                // sendStatus(message)
                fullyConsolidatedRefs.push({"Comment": message})
            }

            sendStatus(`There were ${priceDeterminationErrors} price determination failures.`)

            if (priceDeterminationErrors != 0) {
                // sendStatus(`That should have been zero - each time there was an error, the tool considered the value for your referrals in a given consolidation period for a given currency to be zero.`)
                message = `These are the pairs that failed to resolve, and were valued at zero.  Perhaps Binance delisted them?: ${failedPricePairs}`
                // sendStatus(message)
                fullyConsolidatedRefs.push({"Comment": message})
            }
            // console.log(consolidatedRefs)
        }

        sendStatus('Writing to CSV output file...')
        timer.mark()
        await writeToCsvFile(outputPath, fullyConsolidatedRefs, formatForCointrackingImport)
        sendStatus(`CSV written in ${timer.read()} seconds`)
        sendStatus(`Done.`)

    } catch (e) {
        console.log(e.stack)
        sendStatus("Hmm... there was some kind of error.  Program stopped.")
        sendStatus(e.stack)
    }

  }

module.exports = analyzeIncome
