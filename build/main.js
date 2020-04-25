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
                    // TODO: Temporary code for experimentation
                    let reading = data[3];
                    switch (data[2]) {
                        case 0x29:
                            let mappings = this.getDatagramMappingsByRequestCode(data[5]);
                            let mapping = mappings[0];
                            let objectId = mapping.id;
                            let value = mapping.encoding(data[3]);
                            try {
                                let hasChangedState = yield this.setStateChangedAsync(objectId, { val: value, ack: true });
                                this.log.info(`Object ${objectId} state changed: ${hasChangedState}`);
                            }
                            catch (err) {
                                this.log.info(`Unable to change state of ${objectId}: ${err}`);
                            }
                            break;
                        case 0xA3:
                            let powerState = (reading & 0x01) != 0;
                            let serviceReminder = (reading & 0x80) != 0;
                            this.log.debug(`power: ${powerState}, serviceReminder: ${serviceReminder}`);
                            yield this.setStateAsync("Readings.power", { val: powerState, ack: false });
                            yield this.setStateAsync("Readings.serviceReminder", { val: serviceReminder, ack: false });
                            break;
                        default:
                            break;
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
    decodeIdentity(val) {
        return val;
    }
    decodeFanSpeed(reading) {
        let fanSpeed = Math.log2(reading + 1);
        return Number.isInteger(fanSpeed) ? fanSpeed : undefined;
    }
    ;
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