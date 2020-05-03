import * as utils from "@iobroker/adapter-core";
import * as SerialPort from "serialport";

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
		}
	}
}

type DatagramSender = "MainUnit" | "Panel.1" | "Panel.2" | "Panel.3" | "Panel.4" | "Panel.5" | "Panel.6" | "Panel.7" | "Panel.8" | "Panel.9" | undefined;
//type DatagramReceiver = "All" | "MainUnit" | "All Panels" | "Panel.1" | "Panel.2" | "Panel.3" | "Panel.4" | "Panel.5" | "Panel.6" | "Panel.7" | "Panel.8" | "Panel.9" | undefined;

type DatagramMapping = {
	"fieldCode": number;
	"fieldBitPattern": number | undefined;
	"id": string;
	"encoding": Function;
  }


class ValloxSerial extends utils.Adapter {
	// Member variables
	serialPort! : SerialPort
	datagramSource! : SerialPort.parsers.Delimiter;
	datagramStateMap: Array<DatagramMapping> = [];

	/**
	 * Constructor: Bind event handlers.
	 * 
	 * @param options 
	 */
	public constructor(options: Partial<ioBroker.AdapterOptions> = {}) {
		super({
			...options,
			name: "valloxserial",
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

		// initialize and pipe serial port input through DelimiterParser
		this.datagramSource = this.serialPort.pipe(new SerialPort.parsers.Delimiter(
			/* Datagrams start with a 0x01 byte, so we use a
			   Delimiter parser for separating datagrams */
			{ delimiter: [0x1] }
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
		let datagramString: string = this.toHexStringDatagram(data);
		this.logEventHandlers(`onDataReady([${datagramString}]) called.`);
		this.logDatagram(datagramString);

		// check length and checksum
		if (data.length == 5 && this.hasRightChecksum(data)) {
			// only look at datagrams that are sent by the main unit
			if (this.decodeSender(data[0]) == "MainUnit") {

				let mappings = this.getDatagramMappingsByRequestCode(data[2]);
				for (let mapping of mappings) {
					let objectId = mapping.id;
					let reading = (!!mapping.fieldBitPattern) ?
						mapping.encoding(data[3], mapping.fieldBitPattern) :
						mapping.encoding(data[3]);
					
					if (this.config.logAllReadingsForStateChange) {
						this.log.info(`Reading (code: ${this.toHexString(data[2], true)}, val: ${data[3]}) => to Object ${objectId}. Encoded value: ${reading}.`);
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
					this.log.warn("No mapping found for code "+this.toHexString(data[2], true)+`. Datagram was ${datagramString}`);
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
		
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);

			// TODO: Do it right. This is just a dummy implementation
			let datagram : number[] = [0x01,  // Domain, always 0x01
									   0x22,  // act as panel 2
									   0x11,  // send to ventilation unit
									   0x29,  // set field, code for fan speed
									   0xFF,  // placeholder for value
									   0xFF]; // placeholder for checksum

			if (state.val >= 0 && state.val <= 8) {
				datagram[4] == this.encodeFanSpeed(state.val);
				this.addChecksum(datagram);

				this.toHexStringDatagram(datagram);

				this.serialPort.write(datagram, (error, bytesWritten) => {
					this.log.info(`SEND COMMAND: Wrote ${bytesWritten} to serial port.`);
					if (!!error) {
						this.log.error(`ERROR WHEN WRITING TO SERIAL PORT: ${error}`);
					}
				});
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
			//let encodingFunction: Function = this.decodeIdentity;
			let encodingFunction =
				(enc == "fanSpeed") ? this.decodeFanSpeed :
				(enc == "onOff") ? this.decodeOnOff :
				(enc == "humidity") ? this.decodeHumidity :
				(enc == "temperature") ? this.decodeTemperature :
				this.decodeIdentity

			let codes = obj?.common?.custom?.fieldCodes || [];
			for (let code of codes) {
				let bitPatternValue: number | undefined = (!!obj?.common?.custom?.fieldBitPattern) ?
					parseInt(obj.common.custom.fieldBitPattern) : undefined;
				this.datagramStateMap.push({ fieldCode: +code, fieldBitPattern: bitPatternValue, id: obj._id, encoding: encodingFunction});
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

	// ////////////////////////////////////////////////////////////////
	// Section with datagram functions
	// TODO: Put these function in a separate Utils class
	// ////////////////////////////////////////////////////////////////
	private hasRightChecksum(data: number[]): boolean {
		let checksumCalculated : number = (data[0]+data[1]+data[2]+data[3]+0x01) & 0xFF;
    	return (checksumCalculated == data[4]);
	}

	private addChecksum(data: number[]): number {
		let checksum = (data[0]+data[1]+data[2]+data[3]+data[4]) & 0xFF;
		data[5] = checksum;
		return checksum;
	}

	private toHexString(byte: number, prefix: boolean = false): string {
		return (prefix?"0x":"") + (("0" + (byte & 0xFF).toString(16)).slice(-2));
	}

	private toHexStringDatagram(bytes: number[], prefix: boolean = false): string {
		let result: string = "";
		bytes.forEach(byte => { 
			result += this.toHexString(byte, prefix) + " ";
		});
		return result;
	}

	private decodeSender(senderByte: number): DatagramSender {
		let codeSenderMap: {[key: string]: DatagramSender} = {
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
	};

	private decodeIdentity(reading: any): any {
		return reading;
	}

	// TODO: Add unit test: from 0 to 8 decodeFanSpeed(encodeFanSpeed(i))==i and encodeFanSpeed(decodeFanSpeed(i))==i
	private decodeFanSpeed(reading: number): number | undefined {
		let fanSpeed: number = Math.log2(reading + 1);
		return Number.isInteger(fanSpeed) ? fanSpeed : undefined;
	}

	private encodeFanSpeed(setvalue: number): number {
		return (0x1 << setvalue)-1;
	  }

	private decodeOnOff(reading: number, fieldBitPattern: number): boolean | undefined {
		return (reading & fieldBitPattern) != 0;
	}

	private decodeHumidity(reading:number): number | undefined {
		let result = (reading-51) / 2.04;
		return ((result>=0) && (result<=100)) ? result : undefined;
	}

	private decodeTemperature(sensorValue: number) {
		let temperatureMap = 
		   [-74,-70,-66,-62,-59,-56,-54,-52,-50,-48, // 0x00 - 0x09
			-47,-46,-44,-43,-42,-41,-40,-39,-38,-37, // 0x0A - 0x13
			-36,-35,-34,-33,-33,-32,-31,-30,-30,-29, // 0x14 -
			-28,-28,-27,-27,-26,-25,-25,-24,-24,-23, // 0x1E -
			-23,-22,-22,-21,-21,-20,-20,-19,-19,-19, // 0x28 -
			-18,-18,-17,-17,-16,-16,-16,-15,-15,-14, // 0x32 -
			-14,-14,-13,-13,-12,-12,-12,-11,-11,-11, // 0x3C -
			-10,-10, -9, -9, -9, -8, -8, -8, -7, -7, // 0x46 -
			 -7, -6, -6, -6, -5, -5, -5, -4,- 4,- 4, // 0x50 -
			 -3, -3, -3, -2, -2, -2, -1, -1, -1, -1, // 0x5A -
			  0,  0,  0,  1,  1,  1,  2,  2,  2,  3, // 0x64 -
			  3,  3,  4,  4,  4,  5,  5,  5,  5,  6,
			  6,  6,  7,  7,  7,  8,  8,  8,  9,  9,
			  9, 10, 10, 10, 11, 11, 11, 12, 12, 12,
			 13, 13, 13, 14, 14, 14, 15, 15, 15, 16,
			 16, 16, 17, 17, 18, 18, 18, 19, 19, 19,
			 20, 20, 21, 21, 21, 22, 22, 22, 23, 23,
			 24, 24, 24, 25, 25, 26, 26, 27, 27, 27,
			 28, 28, 29, 29, 30, 30, 31, 31, 32, 32,
			 33, 33, 34, 34, 35, 35, 36, 36, 37, 37,
			 38, 38, 39, 40, 40, 41, 41, 42, 43, 43,
			 44, 45, 45, 46, 47, 48, 48, 49, 50, 51, //
			 52, 53, 53, 54, 55, 56, 57, 59, 60, 61, // 0xDC -
			 62, 63, 65, 66, 68, 69, 71, 73, 75, 77, // 0xE6 - 
			 79, 81, 82, 86, 90, 93, 97,100,100,100, // 0xF0 -
			100,100,100,100,100,100];
		return temperatureMap[sensorValue]; 
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