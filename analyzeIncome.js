const fs = require('fs')
const neatCsv = require('neat-csv')
const moment = require('moment')
const asyncForEach = require('./utils/asyncForEach')
const Decimal = require('decimal.js')
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fetch = require('node-fetch')


let totalRefEntries = 0
let oldProgress = 0
let priceDeterminationErrors = 0
let failedPricePairs = ""
let priceErrorsSuccessfullyResolvedInFuture = 0
let jumpedForwardPricePairs = ""

var sendProgressBarIpcMessage

let lastDateWhenRefPricesWereChecked = ""
let bnbbtcRefPrice = Decimal(0)
let btcusdtRefPrice = Decimal(0)


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

const createOrAddToBalance = function(balanceObject, currency, amount) {

    if (typeof balanceObject[currency] != "undefined") {
        balanceObject[currency] = balanceObject[currency].add(amount)
        // balanceObject[currency] = balanceObject[currency]+amount

    } else {
        balanceObject[currency] = amount
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
        const consolidatedRefEntry = {
            "Type": "Income",
            "Buy Amount": consolidatedIntervalObject[currency].toString(),
            "Buy Currency": currency,
            "Exchange": "Binance",
            "Comment": `Binance referral income from ${previousTimestamp.format('YYYY-MM-DD')} to ${momentDate.subtract(1, 'milliseconds').format('YYYY-MM-DD')}, computed with Binance Referral Analyzer`,
            "Date": momentDate.format('YYYY-MM-DD HH:mm:ss')
        }

        currentConsolidatedIntervalArray.push(consolidatedRefEntry)
    }

    const currentConsolidatedIntervalArrayAlphabetized = currentConsolidatedIntervalArray.sort(alphabetizeByCurrency)
    currentConsolidatedIntervalArrayAlphabetized.push([])
    console.log("Consolidated interval added")

    return currentConsolidatedIntervalArrayAlphabetized
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

        const asset = ref.asset
        const amount = ref.decimalAmount

        createOrAddToBalance(currentIntervalConsolidationsObj, asset, amount)

        progressBarUpdate(arrayOfRefs.length, "remaining")


    }

    arrayOfConsolidations = arrayOfConsolidations.concat(convertConsolidatedIntervalObjToArray(currentIntervalConsolidationsObj, currentTripwire, previousTripwire))
    currentIntervalConsolidationsObj = {}

    return arrayOfConsolidations

}

const writeToCsvFile = async (path, consolidatedRefs, formatForCointrackingImport) => {

    let csvHeaders = []

    if (formatForCointrackingImport) {
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
            {id: "Buy Currency", title: "Buy Currency"}, 
            {id: "Buy Amount", title: "Buy Amount"}, 
            {id: "Contemporary BTC Value", title: "Contemporary BTC Value"},
            {id: "Contemporary BNB Value", title: "Contemporary BNB Value"},
            {id: "Contemporary USDT Value", title: "Contemporary USDT Value"},
            {id: "Comment", title: "Comment"}, 
        ]
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


const getHistoricalValue = async (amount, currency, valueInCurrency, date) => {

    
    let symbol = currency + valueInCurrency

    let symbolIsFlipped = false

    // console.log(symbol)

    if (currency == valueInCurrency) {
        return amount
    }

    let startTime = moment.utc(date).valueOf()
    let endTime = startTime + 60000
    let requestUrl = `https://www.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&startTime=${startTime}&endTime=${endTime}`

    let res = await fetch(requestUrl)

    if (res.status != 200 && res.status.toString()[0] != "4") {

        console.log(res.status.toString()[0])

        console.log("Something went wrong during price retrieval.  Here's the full response:")
        console.log(res)
        throw( new Error(`Hmm... something went wrong while retrieving price data from Binance.  It might be a problem with this app, or it might be that the Binance API is down for maintenance right now.  I'd recommend trying again in a little while.  Here's the HTTP error code that Binance reported: [[ ${res.status} ]] // [[ ${res.statusText} ]].  Request URL: ${requestUrl}`))

    }

    // console.log(res.status)
    let json = await res.json()

    try {
        if (json.msg == "Invalid symbol.") {
            // console.log("Invalid symbol!  Will try to reverse the symbol...")

            symbol = valueInCurrency + currency
            
            requestUrl = `https://www.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&startTime=${startTime}&endTime=${endTime}`

            res = await fetch(requestUrl)
            json = await res.json()
            // console.log(json)

            symbolIsFlipped = true

        }

        const hoursToAdd = 24
        let goForwardAttempts = 0
        let originalStartTime = startTime
        let originalEndTime = endTime
        while (json.length == 0 && goForwardAttempts <= 32) {
            console.log(json)
            startTime = startTime + hoursToAdd*3600000
            endTime = endTime + hoursToAdd*3600000

            console.log(`Trying to jump forward on symbol ${symbol} for date ${date}, forward to ${moment.utc(startTime).format()}. This is jump-forward attempt #${goForwardAttempts}`)

            requestUrl = `https://www.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&startTime=${startTime}&endTime=${endTime}`

            res = await fetch(requestUrl)
            json = await res.json()
            goForwardAttempts++

            if (json.length != 0) {
                priceErrorsSuccessfullyResolvedInFuture++
                jumpedForwardPricePairs = jumpedForwardPricePairs + `${symbol} for ${date} jumped forward to ${moment.utc(startTime).format()}, `
            }
        }

        if (json.length == 0) {
            // If we still don't have any results yet, we try flipping the symbol.
            // This is inspired by TUSD.  There is a TUSDBTC symbol that existed, but is now delisted.  So that request returns an empty result.
            // In reality, however, it has been replaced by BTCTUSD.  So, to be on the safe side, we try flipping every unresolved symbol.

            const oldSymbol = symbol

            symbol = valueInCurrency + currency
                
            requestUrl = `https://www.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&startTime=${originalStartTime}&endTime=${originalEndTime}`

            res = await fetch(requestUrl)
            json = await res.json()

            if (json.length == 0) {
                console.log(`Flipped the symbol, and found one that returns an empty array in reverse.  Will try requesting future prices for ${symbol}`)
                goForwardAttempts = 0
                while (json.length == 0 && goForwardAttempts <= 28) {
                    console.log(json)
                    startTime = startTime + hoursToAdd*3600000
                    endTime = endTime + hoursToAdd*3600000
                    console.log(`Trying to jump forward on symbol ${symbol} for date ${date}, forward to ${moment.utc(startTime).format()}. This is jump-forward attempt #${goForwardAttempts}`)

                    requestUrl = `https://www.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&startTime=${startTime}&endTime=${endTime}`
        
                    res = await fetch(requestUrl)
                    json = await res.json()
                    goForwardAttempts++
        
                    if (json.length != 0) {
                        priceErrorsSuccessfullyResolvedInFuture++
                        jumpedForwardPricePairs = jumpedForwardPricePairs + `${symbol} for ${date} jumped forward to ${moment.utc(startTime).format()}, `
                    }
                }
            }


            if (json.msg == "Invalid symbol.") {
                json = []
                symbolIsFlipped = false
                symbol = oldSymbol
            }



            symbolIsFlipped = true

        }
        


        const klineDataForFirstMinute = json[0]
        const startingPrice = klineDataForFirstMinute[1]
        // console.log("starting price: ", startingPrice)

        // return startingPrice

        const priceDec = Decimal(startingPrice)

        if (!symbolIsFlipped) {
            const priceInTargetCurrency = priceDec.times(amount)
            return priceInTargetCurrency.toDecimalPlaces(8).toString()
        } else {
            const priceInTargetCurrency = Decimal(amount).dividedBy(priceDec)
            return priceInTargetCurrency.toDecimalPlaces(8).toString()
        }
    } catch (e) {

        const responseStatusCode = res.status

        if (responseStatusCode == 429 || responseStatusCode == 418) {
            throw(`Binance has rate-limited or banned this IP address. Binance API response code: `, responseStatusCode)
        }

        if (json.length == 0 || json.msg == "Invalid symbol.") {
            console.log(`Skipping pricing info for symbol: ${symbol} on date: ${date}. This tool will pretend that the price was zero. Binance did not return any pricing data for this item, including for several days into the future.`)
            priceDeterminationErrors++
            failedPricePairs = failedPricePairs + `${symbol} for ${date}, `
            return "0"
        } else {
            console.log("Something went wrong retrieving the price info for symbol: ", symbol)
            console.log(`Date: `, date)
            console.log("JSON: ")
            console.log(json)
            console.log("full response object: ")
            console.log(res)
            throw(e)
        }
    }

}

async function addPriceToArray (arrayEntry, index, dataArray) {

    // get BTC/USD price for this date, unless we have it already
    // get ETH/BTC price for this date, unless we have it already
    // get BTC price for this asset for this date

    if (typeof arrayEntry["Buy Currency"] != 'undefined') {

        const currency = arrayEntry["Buy Currency"]
        const date = arrayEntry["Date"]
        const amount = arrayEntry["Buy Amount"]

        if (date != lastDateWhenRefPricesWereChecked) {
            console.log("New date series.  Getting new reference pricing info for: ", date)
            bnbbtcRefPrice = await getHistoricalValue(1, "BNB", "BTC", date)
            btcusdtRefPrice = await getHistoricalValue(1, "BTC", "USDT", date)
            lastDateWhenRefPricesWereChecked = date
            // console.log(`BNBBTC ref price for ${date}: ${bnbbtcRefPrice}`)
            // console.log(`BTCUSDT ref price for ${date}: ${btcusdtRefPrice}`)
            if (priceErrorsSuccessfullyResolvedInFuture != 0 || priceDeterminationErrors != 0) {
                console.log(`Prices resolved in future: `, priceErrorsSuccessfullyResolvedInFuture)
                console.log(`Pairs resolved in future so far : `, jumpedForwardPricePairs)
                console.log(`Price determination errors so far: `, priceDeterminationErrors)
                console.log(`Failed price pairs so far: `, failedPricePairs)
            }
        }

        const contempBtcValue = await getHistoricalValue(amount, currency, "BTC", date)

        arrayEntry["Contemporary BTC Value"] = contempBtcValue
        arrayEntry["Contemporary BNB Value"] = Decimal(contempBtcValue).dividedBy(bnbbtcRefPrice).toDecimalPlaces(8).toString()
        arrayEntry["Contemporary USDT Value"] = Decimal(contempBtcValue).times(btcusdtRefPrice).toDecimalPlaces(8).toString()
        // arrayEntry.ethPrice = 0
        // arrayEntry.usdPrice = 0


        dataArray[index] = arrayEntry

        progressBarUpdate(index, "index")
    }

}




const analyzeIncome = async (sendStatus, arrayOfPaths, interval, outputPath, filtersObj, formatForCointrackingImport, sendProgressBarPercent) => {

    try {

        // const errorProducer = undefined
        // console.log(errorProducer[1])

        sendProgressBarIpcMessage = sendProgressBarPercent
        priceDeterminationErrors = 0
        failedPricePairs = ""
        priceErrorsSuccessfullyResolvedInFuture = 0
        jumpedForwardPricePairs = ""
        
        
        sendStatus("Beginning analysis...")
        console.log("Paths: ", arrayOfPaths)
        console.log("Interval (days): ", interval)
        sendStatus(`Output path: ${outputPath}`)
        console.log("Filters: ", filtersObj)

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

        let timestampsNotAddedYet = true
        if (filtersObj.startDate != "" || filtersObj.endDate != "") {

            console.log('Adding Moment timestamps and Decimals...')
            sendStatus("Parsing dates and amounts...")
            timer.mark()
            allRefEntries.forEach(addMomentsAndDecimals)
            console.log(`Timestamps/Decimals added in ${timer.read()} seconds`)
            sendStatus(`Dates/amounts parsed in ${timer.read()} seconds`)
            timestampsNotAddedYet = false

        }


        if (filtersObj.specificCurrencies.length > 0 || filtersObj.specificReferals.length > 0  || filtersObj.startDate != "" || filtersObj.endDate != "") {
            sendStatus('Applying filter(s)...')
            timer.mark()
            allRefEntries = filterRefArray(allRefEntries, filtersObj)
            sendStatus(`Filtered in ${timer.read()} seconds`)
            sendStatus(`${allRefEntries.length} income entries remaining after filtering. (${(allRefEntries.length/totalRefEntries*100).toFixed(4)}% of original)`)
            // sendStatus(`${Math.round((allRefEntries.length/totalRefEntries).toFixed(4))}% of income entries remaining after filtering`)

            if (allRefEntries.length == 0) {
                sendStatus('No income left after filtering!  Ending here.  Try specifying looser filters.')
                return
            }

            totalRefEntries = allRefEntries.length
        }
        // console.log(`Final 2 ref entries:`)

        if (timestampsNotAddedYet) {

            console.log('Adding Moment timestamps and Decimals...')
            sendStatus("Parsing dates and amounts...")
            timer.mark()
            allRefEntries.forEach(addMomentsAndDecimals)
            console.log(`Timestamps/Decimals added in ${timer.read()} seconds`)
            sendStatus(`Dates/amounts parsed in ${timer.read()} seconds`)

        }

        sendStatus('Sorting by date...')
        timer.mark()
        allRefEntries.sort(compareDateByMomentTimestamp)
        sendStatus(`Sorted in ${timer.read()} seconds`)
        console.log("Final referral income entry:")
        consoleLogRefEntry(allRefEntries[allRefEntries.length - 1])

        sendStatus("Consolidating to intervals...")
        timer.mark()
        const consolidatedRefs = consolidateToInterval(allRefEntries, interval)
        sendStatus(`Consolidated in ${timer.read()} seconds`)
        // console.log(consolidatedRefs)


        

        if (!formatForCointrackingImport) {
            totalRefEntries = consolidatedRefs.length
            sendStatus("Retrieving/adding price data...")
            timer.mark()
            await asyncForEach(consolidatedRefs, addPriceToArray)
            sendStatus(`Prices added in ${timer.read()} seconds`)


            let message = `There were ${priceErrorsSuccessfullyResolvedInFuture} times that the tool couldn't determine a price on the requested date, but for which the tool found a price at some point in the future.`
            sendStatus(message)
            consolidatedRefs.push({"Comment": message})

            if (priceErrorsSuccessfullyResolvedInFuture != 0) {
                // sendStatus(`WARNING: That might reduce accuracy.`)
                
                message = `These are the pairs that had to be priced in the future: ${jumpedForwardPricePairs}`
                // sendStatus(message)
                consolidatedRefs.push({"Comment": message})
            }

            sendStatus(`There were ${priceDeterminationErrors} price determination failures.`)

            if (priceDeterminationErrors != 0) {
                // sendStatus(`That should have been zero - each time there was an error, the tool considered the value for your referrals in a given consolidation period for a given currency to be zero.`)
                message = `These are the pairs that failed to resolve, and were valued at zero.  Perhaps Binance delisted them?: ${failedPricePairs}`
                // sendStatus(message)
                consolidatedRefs.push({"Comment": message})
            }
            // console.log(consolidatedRefs)
        }

        sendStatus('Writing to CSV output file...')
        timer.mark()
        await writeToCsvFile(outputPath, consolidatedRefs, formatForCointrackingImport)
        sendStatus(`CSV written in ${timer.read()} seconds`)
        sendStatus(`Done.`)

    } catch (e) {
        console.log(e.stack)
        sendStatus("Hmm... there was some kind of error.  Program stopped.")
        sendStatus(e.stack)
    }

  }

module.exports = analyzeIncome