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
        this.on("ready", this.onReady.bind(this));
        this.on("objectChange", this.onObjectChange.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        // this.on("message", this.onMessage.bind(this));
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
            // TODO: change this to loglevel debug later on
            let datagramString = this.toHexStringDatagram(data);
            this.log.info(`Data received: "${datagramString}"`);
            // check length and checksum
            if (data.length == 5 && this.hasRightChecksum(data)) {
                this.log.info("Checksum correct");
            }
            else {
                this.log.warn("Checksum not correct");
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
            //
            // TODO: replace section with real states and channels (still code from template)
            //
            /*
            For every state in the system there has to be also an object of type state
            Here a simple template for a boolean variable named "testVariable"
            Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
            */
            yield this.setObjectAsync("testVariable", {
                type: "state",
                common: {
                    name: "testVariable",
                    type: "boolean",
                    role: "indicator",
                    read: true,
                    write: true,
                },
                native: {},
            });
            // in this template all states changes inside the adapters namespace are subscribed
            this.subscribeStates("*");
            /*
            setState examples
            you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
            */
            // the variable testVariable is set to true as command (ack=false)
            yield this.setStateAsync("testVariable", true);
            // same thing, but the value is flagged "ack"
            // ack should be always set to true if the value is received from or acknowledged from the target system
            yield this.setStateAsync("testVariable", { val: true, ack: true });
            // same thing, but the state is deleted after 30s (getState will return null afterwards)
            yield this.setStateAsync("testVariable", { val: true, ack: true, expire: 30 });
            // examples for the checkPassword/checkGroup functions
            let result = yield this.checkPasswordAsync("admin", "iobroker");
            this.log.info("check user admin pw iobroker: " + result);
            result = yield this.checkGroupAsync("admin", "admin");
            this.log.info("check group user admin group admin: " + result);
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
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.message" property to be set to true in io-package.json
    //  */
    // private onMessage(obj: ioBroker.Message): void {
    // 	if (typeof obj === "object" && obj.message) {
    // 		if (obj.command === "send") {
    // 			// e.g. send email or pushover or whatever
    // 			this.log.info("send command");
    // 			// Send response in callback if required
    // 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
    // 		}
    // 	}
    // }
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