import * as utils from "@iobroker/adapter-core";
import * as SerialPort from "serialport";
import { SerialPortInterByteTimeoutParser as InterByteTimeoutParser } from "./SerialPortInterByteTimeoutParser";
import { DatagramUtils as dutils, DatagramSender, DatagramReceiver } from "./DatagramUtils";

// Augment the adapter.config object with the actual types
declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace ioBroker {
		interface AdapterConfig {
			// Define the shape of your options here (recommended)
			serialPortDevice: string;
			loglevelDatagrams: "Off" | "Silly" | "Debug" | "Info";
			logSerialPortEvents: boolean;
			logEventHandlers: boolean;
			logAllReadingsForStateChange: boolean;
			controlUnitAddress: string;
		}
	}
}

type DatagramMapping = {
	"fieldCode": number;
	"fieldBitPattern": number | undefined;
	"id": string;
	"encoding": Function;
  }


class ValloxSerial extends utils.Adapter {
	// Member variables
	serialPort! : SerialPort
	datagramSource! : InterByteTimeoutParser;
	datagramStateMap: Array<DatagramMapping> = [];

	/**
	 * Constructor: Bind event handlers.
	 * 
	 * @param options 
	 */
	public constructor(options: Partial<ioBroker.AdapterOptions> = {}) {
		// @ts-ignore: Types of property 'options' are incompatible.
		super({
			...options,
			name: "valloxserial"
		});
		this.on("ready", this.onReady.bind(this));
		this.on("objectChange", this.onObjectChange.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		this.on("unload", this.onUnload.bind(this));

		this.buildDatagramStateMap();
	}

	/**
	 * Monitor all stuff that happens with the serial port.
	 */
	private bindPortEvents() {
		this.serialPort.on('error', (err) => {
			this.log.error(`PROBLEM WITH SERIAL PORT: ${err.message}`);
		});
		this.serialPort.on('open', () => {
			this.logSerialPortEvent("Serial port opened");
		});
		this.serialPort.on('close', () => {
			this.logSerialPortEvent("Serial port closed");
		});
		this.serialPort.on('pause', () => {
			this.logSerialPortEvent("Serial port paused");
		});
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	private async onReady(): Promise<void> {
		this.logEventHandlers("onReady() called.");

		this.logSerialPortEvent(`Opening serial port ${this.config.serialPortDevice} at 9600 bit/s, 8 databits, no parity, 1 stop bit.`);
		this.serialPort = new SerialPort(this.config.serialPortDevice, {
			autoOpen: true,
			baudRate: 9600,
			dataBits: 8,
			parity: 'none',
			stopBits: 1
		  });
		this.bindPortEvents();

		// initialize and pipe serial port input through InterByteTimeoutParser
		this.datagramSource = this.serialPort.pipe(new InterByteTimeoutParser(
			/* Each received data word has a size of 6 bytes,
			   hence a buffer of 6 is sufficient. We assume that
			   between two data words at least 50ms of time will
			   pass by. */
			{ maxBufferSize: 6,
			  interval: 50 }
		));

		this.datagramSource.on("data", this.onDataReady.bind(this));

		// Subscribe to all writable states
		this.subscribeStatesAsync(`${this.namespace}.Commands.*`);
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 */
	private onUnload(callback: () => void): void {
		try {
			this.logEventHandlers("onUnload() called.");

			this.serialPort.pause();
			this.serialPort.close();

			this.log.info("cleaned everything up...");
			callback();
		} catch (e) {
			callback();
		}
	}

	private async onDataReady(data : number[]): Promise<void> {
		let datagramString: string = dutils.toHexStringDatagram(data);
		this.logEventHandlers(`onDataReady([${datagramString}]) called.`);
		this.logDatagram(datagramString);

		// check length and checksum
		if (data.length == 6 && dutils.hasRightChecksum(data)) {
			// only look at datagrams that are sent by the main unit
			this.log.debug(`data[1] == ${dutils.toHexString(<number> data[1])}`);
			if (dutils.decodeAddressToControlUnit(data[1]) == "MainUnit") {

				let mappings = this.getDatagramMappingsByRequestCode(data[3]);
				for (let mapping of mappings) {
					let objectId = mapping.id;
					let reading = (!!mapping.fieldBitPattern) ?
						mapping.encoding(data[4], mapping.fieldBitPattern) :
						mapping.encoding(data[4]);
					
					if (this.config.logAllReadingsForStateChange) {
						this.log.info(`Reading (code: ${dutils.toHexString(data[3], true)}, val: ${data[4]}) => to Object ${objectId}. Encoded value: ${reading}.`);
					}
											
					try {
						let stateChange = await this.setStateChangedAsync(objectId, reading, true);
						let stateChangeString = JSON.stringify(stateChange);
						if (this.config.logAllReadingsForStateChange) {
							this.log.info(`Object ${objectId} state changed to ${stateChangeString}`);
						}
					} catch (err) {
						this.log.info(`Unable to change state of ${objectId}: ${err}`);
					}
				}

				if (mappings.length == 0) {
					this.log.warn("No mapping found for code "+dutils.toHexString(data[3], true)+`. Datagram was ${datagramString}`);
				}
			} 
		} else {
			this.log.warn(`Checksum of datagram ${datagramString} is not correct.`);
		}
	}

	/**
	 * Is called if a subscribed object changes
	 */
	private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
		this.logEventHandlers(`onObjectChange(id: ${id}, obj: ${JSON.stringify(obj)}) called.`);
		
		if (obj) {
			// The object was changed
			this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
		} else {
			// The object was deleted
			this.log.info(`object ${id} deleted`);
		}
	}

	/**
	 * Is called if a subscribed state changes
	 */
	private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
		this.logEventHandlers(`onStateChange(id: ${id}, state: ${JSON.stringify(state)}) called.`);
		
		if (state && !!state.val) {
			if (this.isCommand(state)) {
				// The state was changed
				this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);

				let commandConfig = this.getCommandConfig(id);
				let commandDatagram = dutils.getDatagramForCommand(commandConfig, state.val, this.config.controlUnitAddress as DatagramSender);

				this.log.debug(`Compiled command datagram: ${dutils.toHexStringDatagram(commandDatagram)}`); 

				// TODO: Uncomment after debugging
				/*this.serialPort.write(datagram, (error, bytesWritten) => {
					if (!!error) {
						this.log.error(`ERROR WHEN WRITING TO SERIAL PORT: ${error}`);
					} else {
						this.log.debug(`Datagram ${this.toHexStringDatagram(datagram)} successfully sent.`);
					}
				});*/			
			}
		} else {
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
	private buildDatagramStateMap(): void {
		for (let obj of this.ioPack.instanceObjects) {
			
			let enc = obj?.common?.custom?.encoding;
			let decodingFunction = dutils.getDecodeFunctionByName(enc);

			let codes = obj?.common?.custom?.fieldCodes || [];
			for (let code of codes) {
				let bitPatternValue: number | undefined = (!!obj?.common?.custom?.fieldBitPattern) ?
					parseInt(obj.common.custom.fieldBitPattern) : undefined;
				this.datagramStateMap.push({ fieldCode: +code, fieldBitPattern: bitPatternValue, id: obj._id, encoding: decodingFunction});
			}
		}
	}

	private getDatagramMappingsByRequestCode(fieldCode: number): Array<DatagramMapping> {
		let result = [];
		for (let mapping of this.datagramStateMap) {
		  if (mapping.fieldCode == fieldCode) {
			result.push(mapping);
		  }
		}
	  
		return result;
	}

	private getCommandConfig(objectId: string): any  {
		let result = null; // invalid id
		for (let obj of this.ioPack.instanceObjects) { 
			if (obj.type == "state" && obj._id == objectId) {
				result = obj.common;
				break;
			}
		}
		return result;
	}

	private getCommandFieldCode(objectId: string): number  {
		let commandConfig = this.getCommandConfig(objectId);
		return (!!commandConfig) ? 
					commandConfig.custom.fieldCodes[0] :
					0x00; // invalid field code
	}

	private isCommand(state: ioBroker.State | null | undefined) : boolean {
		return (!!state && state.ack == false);
	}

	// ////////////////////////////////////////////////////////////////
	// Section with debug logging functions
	// ////////////////////////////////////////////////////////////////
	private logDatagram(datagramString : string) : void {
		let ll = this.config.loglevelDatagrams;
		let logFunc = (ll == "Silly") ?
			this.log.silly : (ll = "Debug") ?
				this.log.debug : (ll == "Info") ?
					this.log.info :
					undefined;

		if (!!logFunc) {
			logFunc(`Received datagram: ${datagramString}`);
		}
	}

	private logSerialPortEvent(msg : string) :void {
		if (this.config.logSerialPortEvents) {
			this.log.info(msg);
		}
	}

	private logEventHandlers(msg : string) : void {
		if (this.config.logEventHandlers) {
			this.log.info(msg);
		}
	}


}



if (module.parent) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<ioBroker.AdapterOptions> | undefined) => new ValloxSerial(options);
} else {
	// otherwise start the instance directly
	(() => new ValloxSerial())();
}