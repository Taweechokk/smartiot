/************************************************************************
 * SmartIoT (เฉพาะส่วนที่ต้องใช้)
 ************************************************************************/


namespace ESP8266_IoT {
    type MsgHandler = {
        [key: string]: {
            [key: string]: any
        }
    }

    const msgHandlerMap: MsgHandler = {}

    /*
    * on serial received data
    */
    let strBuf = ""
    function serialDataHandler() {
        const str = strBuf + serial.readString()
        let splits = str.split("\n")
        if (str.charCodeAt(str.length - 1) != 10) {
            strBuf = splits.pop()
        } else {
            strBuf = ""
        }
        for (let i = 0; i < splits.length; i++) {
            let res = splits[i]
            Object.keys(msgHandlerMap).forEach(key => {
                if (res.includes(key)) {
                    if (msgHandlerMap[key].type == 0) {
                        msgHandlerMap[key].handler(res)
                    } else {
                        msgHandlerMap[key].msg = res
                    }
                }
            })
        }
    }

    /**
     * ส่ง AT command พร้อม CR+LF
     */
    export function sendAT(command: string, wait: number = 0) {
        serial.writeString(`${command}\u000D\u000A`)
        basic.pause(wait)
    }

    /**
     * ลงทะเบียน handler สำหรับข้อความตอบกลับ
     */
    export function registerMsgHandler(key: string, handler: (res: string) => void) {
        msgHandlerMap[key] = {
            type: 0,
            handler
        }
    }

    export function removeMsgHandler(key: string) {
        delete msgHandlerMap[key]
    }

    /**
     * รอผลตอบกลับที่มี key ภายในเวลาที่กำหนด
     */
    export function waitForResponse(key: string, wait: number = 1000): string {
        let timeout = input.runningTime() + wait
        msgHandlerMap[key] = { type: 1 }
        while (timeout > input.runningTime()) {
            if (msgHandlerMap[key] == null) {
                return null
            } else if (msgHandlerMap[key].msg) {
                let res = msgHandlerMap[key].msg
                delete msgHandlerMap[key]
                return res
            }
            basic.pause(5)
        }
        delete msgHandlerMap[key]
        return null
    }

    /**
     * ส่งคำสั่งแล้วรอผลลัพธ์
     */
    export function sendRequest(command: string, key: string, wait: number = 1000): string {
        serial.writeString(`${command}\u000D\u000A`)
        return waitForResponse(key, wait)
    }

    /**
     * ฟังก์ชัน init สำหรับเปิด Serial และ binding handler
     */
    export function initWIFI(tx: SerialPin, rx: SerialPin, baudrate: BaudRate) {
        serial.redirect(tx, rx, baudrate)
        serial.setTxBufferSize(128)
        serial.setRxBufferSize(128)
        serial.onDataReceived(serial.delimiters(Delimiters.NewLine), serialDataHandler)
    }
    
    export enum SmartIotSwitchState {
        //% block="on"
        on = 1,
        //% block="off"
        off = 2
    }

    let smartiot_connected: boolean = false
    let smartiot_sendMsg: string = ""
    let smartiot_lastSendTime: number = 0
    let smartiot_switchListenFlag: boolean = false
    let smartiot_switchStatus: boolean = false

    // ค่าเริ่มต้นของปลายทาง SmartIoT (แก้ได้ด้วย setSmartIotAddr)
    let smartiot_host: string = "http://www.smartiot.space"
    let smartiot_port: string = "8080"

    // โทเคน/ท็อปปิกที่จะใช้หลัง connect
    let smartiot_token: string = ""
    let smartiot_topic: string = ""

    // สำหรับ block event
    const SmartIotEventValue = {
        switchOn: SmartIotSwitchState.on,
        switchOff: SmartIotSwitchState.off
    }

    /**
     * ตั้งค่า SmartIoT host/port (ถ้าต้องการใช้ปลายทางอื่น)
     */
    export function setSmartIotAddr(host: string, port: string) {
        smartiot_host = host
        smartiot_port = port
    }

    // ประกอบสตริงคำสั่ง HTTPCLIENT ให้สั้นลง
    function concatReqMsg(pathAndQuery: string): string {
        return `AT+HTTPCLIENT=2,0,\"${smartiot_host}:${smartiot_port}${pathAndQuery}\",,,1`
    }

    /**
     * เชื่อมต่อ SmartIoT ด้วย userToken และ topic
     */
    //% subcategory=SmartIoT weight=50
    //% blockId=initsmartiot block="Connect SmartIoT with userToken: %userToken topic: %topic"
    export function connectSmartiot(userToken: string, topic: string): void {
        smartiot_token = userToken
        smartiot_topic = topic

        for (let i = 0; i < 3; i++) {
            const ret = sendRequest(
                concatReqMsg(`/iot/iotTopic/getTopicStatus/${userToken}/${topic}`),
                '"code":200',
                2000
            )
            if (ret != null) {
                smartiot_connected = true
                if (ret.includes('switchOn')) {
                    smartiot_switchStatus = true
                } else if (ret.includes('switchOff')) {
                    smartiot_switchStatus = false
                }
                return
            }
            smartiot_connected = false
        }
    }

    /**
     * เตรียมข้อมูลที่จะส่งขึ้น SmartIoT (1–8 ช่อง)
     */
    //% subcategory=SmartIoT weight=48
    //% blockId=setSmartIotUploadData block="set data to send SmartIoT |Data 1 = %n1||Data 2 = %n2|Data 3 = %n3|Data 4 = %n4|Data 5 = %n5|Data 6 = %n6|Data 7 = %n7|Data 8 = %n8"
    export function setSmartIotUploadData(
        n1: number = 0,
        n2: number = 0,
        n3: number = 0,
        n4: number = 0,
        n5: number = 0,
        n6: number = 0,
        n7: number = 0,
        n8: number = 0
    ): void {
        smartiot_sendMsg = concatReqMsg(
            `/iot/iotTopicData/addTopicData?userToken=${smartiot_token}&topicName=${smartiot_topic}`
            + "&data1=" + n1
            + "&data2=" + n2
            + "&data3=" + n3
            + "&data4=" + n4
            + "&data5=" + n5
            + "&data6=" + n6
            + "&data7=" + n7
            + "&data8=" + n8
        )
    }

    /**
     * อัปโหลดข้อมูลขึ้น SmartIoT (เว้นช่วงอย่างน้อย 1 วินาทีระหว่างครั้ง)
     */
    //% subcategory=SmartIoT weight=45
    //% blockId=uploadSmartIotData block="Upload data to SmartIoT"
    export function uploadSmartIotData(): void {
        if (!smartiot_connected) return
        const wait = smartiot_lastSendTime + 1000 - input.runningTime()
        if (wait > 0) basic.pause(wait)
        sendAT(smartiot_sendMsg)
        smartiot_lastSendTime = input.runningTime()
    }

    /**
     * เช็คสถานะการเชื่อมต่อ SmartIoT
     */
    //% block="SmartIoT connection %State"
    //% subcategory=SmartIoT weight=35
    export function smartiotState(state: boolean) {
        return smartiot_connected === state
    }

    /**
     * Event เมื่อสวิตช์บน SmartIoT เปลี่ยนสถานะ
     */
    //% block="When SmartIoT switch %vocabulary"
    //% subcategory=SmartIoT weight=30
    //% state.fieldEditor="gridpicker" state.fieldOptions.columns=2
    export function iotSwitchEvent(state: SmartIotSwitchState, handler: () => void) {
        if (state == SmartIotSwitchState.on) {
            registerMsgHandler('{"code":200,"msg":null,"data":"switchOn"}', () => {
                if (smartiot_connected && !smartiot_switchStatus) handler()
                smartiot_switchStatus = true
            })
        } else {
            registerMsgHandler('{"code":200,"msg":null,"data":"switchOff"}', () => {
                if (smartiot_connected && smartiot_switchStatus) handler()
                smartiot_switchStatus = false
            })
        }

        // เริ่ม polling สถานะสวิตช์ทุก 1 วินาที (สร้างครั้งเดียว)
        if (!smartiot_switchListenFlag) {
            basic.forever(() => {
                if (smartiot_connected) {
                    sendAT(concatReqMsg(`/iot/iotTopic/getTopicStatus/${smartiot_token}/${smartiot_topic}`))
                }
                basic.pause(1000)
            })
            smartiot_switchListenFlag = true
        }
    }
}
