var app = new Vue({
    el: "#app",

    // Reacted Data Stuff
    data() {
        return {
            // ui suff
            activeTab: 'device',

            // graph stuff
            xVal: 1,
            dataLength: 3000,
            dps: [],
            chart: null,
            graphSource: '',
            
            // dataset
            fileDataset: [],
            dvc_dataset: [],

            // device config
            dvc_recordDurationLimit: 10,
            dvc_signalFreq: 100,           
            dvc_rValueThreshold: 850,     
            dvc_rrDiffThreshold: 50,
            
            // input file config
            signalFreq: 360,
            rValueThreshold: 1020,
            rrDiffThreshold: 50,
            fileTempData: null,
            dataColumn: [],
            selectedColumn: 0,
            selectedFileName: '',
            selectedColumnName: '',
            
            // result stuff
            avgBpm: 0,
            diff: 0,
            minRR: 0,
            maxRR: 0,
            avgRrMs: 0,
            isPredicted: false,
            
            // websocket stuff
            isRecordingData: false,
            connection_status: 'disconnected',
            connection_timeout: null,
            socket: null
        };
    },

    // Methods stuff
    methods: {
        // Chart methods
        initChart(){
            this.chart = new CanvasJS.Chart("chart", {
                data: [{ type: "line", dataPoints: this.dps }],
                animationEnabled: true,
                zoomEnabled: true,  
            })
        },
        insertChart(array) {
            for (var i = 0; i < array.length; i++) {
                this.dps.push({x: this.xVal, y: array[i]})
                this.xVal++
                if (this.dps.length > this.dataLength)
                    this.dps.shift()
            }
        },
        resetChart(){
            this.xVal = 1
            while (this.dps.length > 0) this.dps.pop()
            this.chart.render()
        },
        
        // Input event methods
        fileInputChanged(event){
            var fr = new FileReader();
            fr.onload = () => this.fileOnLoad(fr)

            if (event.target.files[0].type !== 'text/csv'){
                console.log('wrong file types')
                alert('wrong file types')
                this.$refs.inputFile.value = null
                return
            } 
            fr.readAsText(event.target.files[0])
            this.selectedFileName = event.target.files[0].name
        },
        selectDataPressed(){
            const selectColumn = []
            const col = this.selectedColumn
            if (
                Array.isArray(this.fileTempData) && 
                Array.isArray(this.fileTempData[0]) && 
                this.selectedColumn < this.fileTempData[0].length
            ) {
                this.selectedColumnName = this.fileTempData[0][col]
                this.graphSource = `${this.selectedFileName} - ${this.selectedColumnName}`
                this.fileTempData.forEach(e => {
                    const x = parseInt(e[col])
                    if (x) selectColumn.push(x)
                })
            }
            // draw graph
            this.fileDataset = selectColumn
            if (selectColumn.length > 0){
                this.dataLength = selectColumn.length
                this.resetChart()
                this.insertChart(selectColumn)
                this.chart.render();
            }
        },
        proceedBtnPressed(){
            this.resetResult()
            if (this.getDataset?.length < 1) 
                return 
            const result = this.getResult(this.getDataset, this.getConfig)
            
            this.avgBpm = result.avgBpm
            this.diff = result.diff
            this.minRR = result.minRR
            this.maxRR = result.maxRR
            this.avgRrMs = result.avgRrMs
            this.rrMsStdDev = result.rrMsStdDev
            this.isPredicted = true

            console.log('result', result)
        },
        resetBtnPressed(){
            // reset chart
            this.resetChart()
            
            // reset var
            this.dvc_dataset = []
            this.fileDataset = []
            this.selectedColumn = 0
            this.dataColumn = []
            this.fileTempData = null
            this.selectedFileName = ''
            this.selectedColumnName = ''
            this.graphSource = ''

            // reset result
            this.resetResult()

            // reset input
            this.$refs.inputFile.value = null
        },
        recordBtnPressed(){
            this.xVal = 1
            this.resetChart()
            this.dvc_dataset = []
            this.isRecordingData = true
            this.dataLength = this.deviceConfig.datasetLimit
            console.log('recording start')
        },

        // Other
        doneRecording(){
            this.isRecordingData = false
            this.graphSource = 'Hardware'
            console.log('recording end')
        },


        // Predict methods
        getResult(input, cfg){
            // helpers
            const subSampleData = (index, dataset, samplingDiff) => {
                const dataLength = dataset.length
                const startIndex = (index - samplingDiff < 0) ? 0 : index - samplingDiff
                const endIndex = (index + samplingDiff >= dataLength) ? dataLength : index + samplingDiff
                
                return {
                    startIndex, endIndex, dataLength,
                    result: dataset.slice(startIndex, endIndex)
                }
            }
            const getMaxValue = (array) => {
                const maxValue = Math.max.apply(null, array)
                const index = array.indexOf(maxValue)
                return { maxValue, index }
            }
            const roundNumber = (n) => {
                return Math.round((n + Number.EPSILON) * 100) / 100
            }
            
            // get R index
            const rIndexes = []
            for (let i = 0; i < input.length; i++) {
                if (input[i] > cfg.rValueThreshold){
                    const sampleData = subSampleData(i, input, cfg.samplingDiff)
                    const maxValue = getMaxValue(sampleData.result)
                    const rIndex = maxValue.index + sampleData.startIndex
                    rIndexes.push(rIndex)
                    i = sampleData.endIndex
                }
            }
            // get rr index diff
            const rIndexesDiff = []
            for (let i = 1; i < rIndexes.length; i++) {
                rIndexesDiff.push(Math.abs(
                    rIndexes[i] - rIndexes[i-1]
                ))
            }

            // convert to ms
            const rrMs = []
            rIndexesDiff.forEach(v => rrMs.push(roundNumber(v * cfg.msBetweenSignal)))
            
            // average RR ms
            let avgRrMs = 0
            rrMs.forEach(v => avgRrMs = avgRrMs + v)
            avgRrMs = roundNumber(avgRrMs / rrMs.length)

            // Min & Max RR ms
            const minRR = Math.min.apply(null, rrMs)
            const maxRR = Math.max.apply(null, rrMs)

            // Standard Dev
            const rrMsStdDev = roundNumber(
                this.getStandardDeviation(rrMs))

            // bpm
            const bpm = []
            let sumBpm = 0
            rrMs.forEach(v => bpm.push(roundNumber(60000 / v)))
            bpm.forEach(v => sumBpm = sumBpm + v)
            const avgBpm = roundNumber(sumBpm / bpm.length)

            // get rr diff
            const rrDiff = []
            if (rrMs.length > 1){
                for (let i = 1; i < rrMs.length; i++) {
                    rrDiff.push(roundNumber(
                        Math.abs(rrMs[i] - rrMs[i-1]))
                    )
                }
            }
            // filtering rr diff
            const filteredRRDiff = rrDiff.filter(v => v > cfg.rrDiffThreshold)
            // diff 
            const diff = roundNumber(filteredRRDiff.length / rrMs.length) * 100

            return {
                rIndexes, 
                rrMs, rrDiff,  
                filteredRRDiff, diff,
                bpm, avgBpm, avgRrMs,
                minRR, maxRR, rrMsStdDev,
                cfg
            }

        },
        resetResult(){
            this.avgBpm = 0
            this.diff = 0
            this.minRR = 0
            this.maxRR = 0
            this.avgRrMs = 0
            this.isPredicted = false
        },

        // Calc Standart dev
        // https://stackoverflow.com/a/53577159
        getStandardDeviation(array){
            if (!Array.isArray(array) || array.length < 1)
                return 0
            const n = array.length
            const mean = array.reduce((a, b) => a + b) / n
            return Math.sqrt(
                array.map(x => 
                    Math.pow(x - mean, 2)
                ).reduce((a, b) => a + b) / n)
        },

        // Websocket methods
        initWebsocket() { 
            this.socket = new ReconnectingWebSocket(
                // 'ws://' + window.location.hostname + ':81/', null, 
                'ws://192.168.43.222:81/', null, 
                { 
                    debug: false, 
                    reconnectInterval: 2000, 
                    maxReconnectInterval: 10000,
                    timeoutInterval: 2000,
                })
            this.socket.onmessage = (event) => { 
                clearTimeout(this.connection_timeout)
                this.connection_timeout = setTimeout(() => {
                    this.connection_status = 'disconnected'
                }, 5000)
                
                this.connection_status = 'connected'
                if (this.isRecordingData)
                    this.processReceivedCommand(event) 
            }
            this.socket.onconnecting = (event) => {
                this.connection_status = 'connecting'
            }
        }, 
        processReceivedCommand(event) { 
            const obj = JSON.parse(event.data) 
            const arr = obj.dataSample
            if (Array.isArray(arr) && arr.length > 0){
                arr.forEach(e => {
                    if (this.dvc_dataset.length < this.deviceConfig.datasetLimit)
                        this.dvc_dataset.push(e)
                    })
                    this.insertChart(arr)
                    this.chart.render()
            }
            if (this.dvc_dataset.length >= this.deviceConfig.datasetLimit){
                this.doneRecording()
            }
        },
        
        // Reading file methods
        fileOnLoad(fr){
            const r = this.CSVToArray(fr.result)
            if (Array.isArray(r) && Array.isArray(r[0])){
                this.fileTempData = Object.freeze(r)
                this.dataColumn = []
                this.selectedColumn = 0
                r[0].forEach(e => this.dataColumn.push(e))
                this.resetChart()
            }
        },
        // ref: http://stackoverflow.com/a/1293163/2343
        CSVToArray(strData, strDelimiter){
            strDelimiter = (strDelimiter || ",")
            var objPattern = new RegExp(
                (
                    // Delimiters.
                    "(\\" + strDelimiter + "|\\r?\\n|\\r|^)" +
                    // Quoted fields.
                    "(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +
                    // Standard fields.
                    "([^\"\\" + strDelimiter + "\\r\\n]*))"
                ),"gi")
            var arrData = [[]]
            var arrMatches = null
            while (arrMatches = objPattern.exec( strData )){
                var strMatchedDelimiter = arrMatches[1]
                if (
                    strMatchedDelimiter.length &&
                    strMatchedDelimiter !== strDelimiter
                    ){
                    arrData.push([])
                }
                var strMatchedValue
                if (arrMatches[2]){
                    strMatchedValue = arrMatches[2].replace(
                        new RegExp( "\"\"", "g" ),"\"")
                } else {
                    strMatchedValue = arrMatches[3]
                }
                arrData[arrData.length - 1].push(strMatchedValue)
            }
            return(arrData)
        }
    },
    // Computed Stuff
    computed: {
        // Computed condfigs
        fileConfig(){
            return {
                rValueThreshold: this.rValueThreshold,
                rrDiffThreshold: this.rrDiffThreshold,
                samplingDiff:    Math.ceil((this.signalFreq*10)/100),
                signalFreq:      this.signalFreq,
                msBetweenSignal: 1000 / this.signalFreq,
                datasetLength:   this.fileDataset.length
            }
        },
        deviceConfig(){
            return {
                rValueThreshold: this.dvc_rValueThreshold,
                rrDiffThreshold: this.dvc_rrDiffThreshold,
                samplingDiff:    Math.ceil((this.dvc_signalFreq * 10) / 100),
                signalFreq:      this.dvc_signalFreq,
                msBetweenSignal: 1000 / this.dvc_signalFreq,
                datasetLimit:    this.dvc_recordDurationLimit * this.dvc_signalFreq,
                datasetLength: this.dvc_dataset.length
            }
        },
        getConfig(){
            return this.activeTab === 'file' ? 
                this.fileConfig : 
                this.deviceConfig
        },
        getDataset(){
            return (this.activeTab === 'file') ? 
                this.fileDataset : 
                this.dvc_dataset
        },

        // Computed prediction result
        predictResult(){
            const cfg = this.getConfig
            return {
                rValueThreshold: cfg.rValueThreshold,
                avgBpm: this.avgBpm,
                signalFreq: cfg.signalFreq,
                dataDuration: (cfg.datasetLength * cfg.msBetweenSignal) / 1000,
                datasetLength: cfg.datasetLength,
                minRR: this.minRR,
                maxRR: this.maxRR, 
                minMaxDiff: Math.abs(this.maxRR - this.minRR), 
                avgRrMs: this.avgRrMs,
                rrMsStdDev: this.rrMsStdDev,
                diff: this.diff,
            }
        },

        recordProgress(){
            const dataLen = this.dvc_dataset.length
            const limit = this.deviceConfig.datasetLimit
            return Math.ceil((dataLen / limit) * 100)
        },
    },

    // Mounted method
    mounted(){
        this.initChart()
        this.initWebsocket()
        this.resetBtnPressed()
    }
})