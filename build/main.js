"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils = require("@iobroker/adapter-core");
const SerialPort = require("serialport");
class ValloxSerial extends utils.Adapter {
    /**
     * Constructor: Bind event handlers.
     *
     * @param options
     */
    constructor(options = {}) {
        super(Object.assign(Object.assign({}, options), { name: "valloxserial" }));
        this.datagramStateMap = [];
        this.on("ready", this.onReady.bind(this));
        this.on("objectChange", this.onObjectChange.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }
    /**
     * Monitor all stuff that happens with the serial port.
     */
    bindPortEvents() {
        this.serialPort.on('error', (err) => {
            this.log.error(`PROBLEM WITH SERIAL PORT: ${err.message}`);
        });
        this.serialPort.on('open', () => {
            this.log.info('Serial port opened');
        });
        this.serialPort.on('close', () => {
            this.log.info('Serial port closed');
        });
        this.serialPort.on('pause', () => {
            this.log.info('Serial port paused');
        });
    }
    onDataReady(data) {
        return __awaiter(this, void 0, void 0, function* () {
            this.log.debug("onDataReady() called.");
            let datagramString = this.toHexStringDatagram(data);
            // check length and checksum
            if (data.length == 5 && this.hasRightChecksum(data)) {
                this.log.debug(`Checksum of datagram ${datagramString} is correct.`);
                if (this.decodeSender(data[0]) == "MainUnit") {
                    let mappings = this.getDatagramMappingsByRequestCode(data[2]);
                    for (let mapping of mappings) {
                        let objectId = mapping.id;
                        let reading = (!!mapping.fieldBitPattern) ?
                            mapping.encoding(data[3], mapping.fieldBitPattern) :
                            mapping.encoding(data[3]);
                        this.log.info("Reading (code: " + this.toHexString(data[2], true) + ", val: " + data[3] + ") " +
                            "=> to Object " + objectId + ". Encoded value: " + reading + ".");
                        this.setStateChangedAsync(objectId, reading, true).then((value) => {
                            this.log.info(`Object ${objectId} state changed to value ${value}`);
                        }).catch((err) => {
                            this.log.warn(`Unable to change state of ${objectId}: ${err}`);
                        });
                        /* try {
                            let stateChange = await this.setStateChangedAsync(objectId, reading, true);
                            let stateChangeString = JSON.stringify(stateChange);
                            this.log.info(`Object ${objectId} state changed ${stateChangeString}`);
                        } catch (err) {
                            this.log.info(`Unable to change state of ${objectId}: ${err}`);
                        } */
                    }
                }
            }
            else {
                this.log.debug(`Checksum of datagram ${datagramString} is not correct.`);
            }
        });
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    onReady() {
        return __awaiter(this, void 0, void 0, function* () {
            this.log.debug("onReady() called.");
            this.log.info(`Opening serial port ${this.config.serialPortDevice} at 9600 bit/s, 8 databits, no parity, 1 stop bit.`);
            this.serialPort = new SerialPort(this.config.serialPortDevice, {
                autoOpen: true,
                baudRate: 9600,
                dataBits: 8,
                parity: 'none',
                stopBits: 1
            });
            this.bindPortEvents();
            // initialize and pipe serial port input through DelimiterParser
            this.datagramSource = this.serialPort.pipe(new SerialPort.parsers.Delimiter(
            /* Datagrams start with a 0x01 byte, so we use a
               Delimiter parser for separating datagrams */
            { delimiter: [0x1] }));
            this.datagramSource.on("data", this.onDataReady.bind(this));
            this.buildDatagramStateMap();
            // TODO: Build object structure for commands (see history for code examples)
        });
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        try {
            this.log.debug("onUnload() called.");
            this.serialPort.pause;
            this.serialPort.close();
            this.log.info("cleaned everything up...");
            callback();
        }
        catch (e) {
            callback();
        }
    }
    /**
     * Is called if a subscribed object changes
     */
    onObjectChange(id, obj) {
        this.log.debug("onObjectChange() called.");
        if (obj) {
            // The object was changed
            this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
        }
        else {
            // The object was deleted
            this.log.info(`object ${id} deleted`);
        }
    }
    /**
     * Is called if a subscribed state changes
     */
    onStateChange(id, state) {
        this.log.debug("onStateChange() called.");
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        }
        else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }
    // ////////////////////////////////////////////////////////////////
    // Section with local helpers
    // ////////////////////////////////////////////////////////////////
    /**
     * Fills the member variablethis.datagramStateMap with a mapping from
     * datagram request codes to object IDs. Therefore the instanceObjects
     * configuration from io-package.json is read.
     */
    buildDatagramStateMap() {
        var _a, _b, _c, _d, _e, _f;
        for (let obj of this.ioPack.instanceObjects) {
            let codes = ((_b = (_a = obj === null || obj === void 0 ? void 0 : obj.common) === null || _a === void 0 ? void 0 : _a.custom) === null || _b === void 0 ? void 0 : _b.fieldCodes) || [];
            let encodingFunction = this.decodeIdentity;
            switch ((_d = (_c = obj === null || obj === void 0 ? void 0 : obj.common) === null || _c === void 0 ? void 0 : _c.custom) === null || _d === void 0 ? void 0 : _d.encoding) {
                case "fanSpeed":
                    encodingFunction = this.decodeFanSpeed;
                    break;
                case "onOff":
                    encodingFunction = this.decodeOnOff;
                    break;
                case "humidity":
                    encodingFunction = this.decodeHumidity;
                    break;
                case "temperature":
                    encodingFunction = this.decodeTemperature;
                    break;
            }
            for (let code of codes) {
                let bitPatternValue = (!!((_f = (_e = obj === null || obj === void 0 ? void 0 : obj.common) === null || _e === void 0 ? void 0 : _e.custom) === null || _f === void 0 ? void 0 : _f.fieldBitPattern)) ?
                    parseInt(obj.common.custom.fieldBitPattern) : undefined;
                this.datagramStateMap.push({ fieldCode: +code, fieldBitPattern: bitPatternValue, id: obj._id, encoding: encodingFunction });
            }
        }
    }
    getDatagramMappingsByRequestCode(fieldCode) {
        let result = [];
        for (let mapping of this.datagramStateMap) {
            if (mapping.fieldCode == fieldCode) {
                result.push(mapping);
            }
        }
        return result;
    }
    // ////////////////////////////////////////////////////////////////
    // Section with datagram functions
    // TODO: Put these function in a separate Utils class
    // ////////////////////////////////////////////////////////////////
    hasRightChecksum(data) {
        let checksumCalculated = (data[0] + data[1] + data[2] + data[3] + 0x01) & 0xFF;
        return (checksumCalculated == data[4]);
    }
    toHexString(byte, prefix = false) {
        return (prefix ? "0x" : "") + (("0" + (byte & 0xFF).toString(16)).slice(-2));
    }
    toHexStringDatagram(bytes, prefix = false) {
        let result = "";
        bytes.forEach(byte => {
            result += this.toHexString(byte, prefix) + " ";
        });
        return result;
    }
    decodeSender(senderByte) {
        let codeSenderMap = {
            0x11: "MainUnit",
            0x21: "Panel.1",
            0x22: "Panel.2",
            0x23: "Panel.3",
            0x24: "Panel.4",
            0x25: "Panel.5",
            0x26: "Panel.6",
            0x27: "Panel.7",
            0x28: "Panel.8",
            0x29: "Panel.9"
        };
        return codeSenderMap[senderByte];
    }
    ;
    decodeIdentity(reading) {
        return reading;
    }
    decodeFanSpeed(reading) {
        let fanSpeed = Math.log2(reading + 1);
        return Number.isInteger(fanSpeed) ? fanSpeed : undefined;
    }
    decodeOnOff(reading, fieldBitPattern) {
        return (reading & fieldBitPattern) != 0;
    }
    decodeHumidity(reading) {
        return (reading - 51) / 2.04;
    }
    decodeTemperature(sensorValue) {
        let temperatureMap = [-74, -70, -66, -62, -59, -56, -54, -52, -50, -48,
            -47, -46, -44, -43, -42, -41, -40, -39, -38, -37,
            -36, -35, -34, -33, -33, -32, -31, -30, -30, -29,
            -28, -28, -27, -27, -26, -25, -25, -24, -24, -23,
            -23, -22, -22, -21, -21, -20, -20, -19, -19, -19,
            -18, -18, -17, -17, -16, -16, -16, -15, -15, -14,
            -14, -14, -13, -13, -12, -12, -12, -11, -11, -11,
            -10, -10, -9, -9, -9, -8, -8, -8, -7, -7,
            -7, -6, -6, -6, -5, -5, -5, -4, -4, -4,
            -3, -3, -3, -2, -2, -2, -1, -1, -1, -1,
            0, 0, 0, 1, 1, 1, 2, 2, 2, 3,
            3, 3, 4, 4, 4, 5, 5, 5, 5, 6,
            6, 6, 7, 7, 7, 8, 8, 8, 9, 9,
            9, 10, 10, 10, 11, 11, 11, 12, 12, 12,
            13, 13, 13, 14, 14, 14, 15, 15, 15, 16,
            16, 16, 17, 17, 18, 18, 18, 19, 19, 19,
            20, 20, 21, 21, 21, 22, 22, 22, 23, 23,
            24, 24, 24, 25, 25, 26, 26, 27, 27, 27,
            28, 28, 29, 29, 30, 30, 31, 31, 32, 32,
            33, 33, 34, 34, 35, 35, 36, 36, 37, 37,
            38, 38, 39, 40, 40, 41, 41, 42, 43, 43,
            44, 45, 45, 46, 47, 48, 48, 49, 50, 51,
            52, 53, 53, 54, 55, 56, 57, 59, 60, 61,
            62, 63, 65, 66, 68, 69, 71, 73, 75, 77,
            79, 81, 82, 86, 90, 93, 97, 100, 100, 100,
            100, 100, 100, 100, 100, 100];
        return temperatureMap[sensorValue];
    }
}
if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options) => new ValloxSerial(options);
}
else {
    // otherwise start the instance directly
    (() => new ValloxSerial())();
}
//# sourceMappingURL=main.js.map