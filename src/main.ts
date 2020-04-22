import * as utils from "@iobroker/adapter-core";
import * as SerialPort from "serialport";

// Augment the adapter.config object with the actual types
declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace ioBroker {
		interface AdapterConfig {
			// Define the shape of your options here (recommended)
			serialPortDevice: string;
			debugLogDatagrams: boolean;

			// TODO: Remove later...
			// Or use a catch-all approach
		    // [key: string]: any;
		}
	}
}

type DatagramSender = "MainUnit" | "Panel.1" | "Panel.2" | "Panel.3" | "Panel.4" | "Panel.5" | "Panel.6" | "Panel.7" | "Panel.8" | "Panel.9" | undefined;
type DatagramReceiver = "All" | "MainUnit" | "All Panels" | "Panel.1" | "Panel.2" | "Panel.3" | "Panel.4" | "Panel.5" | "Panel.6" | "Panel.7" | "Panel.8" | "Panel.9" | undefined;

type DatagramMapping = {
	"fieldCode": number;
	"fieldBitPattern": number | undefined;
	"id": string;
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
	}

	/**
	 * Monitor all stuff that happens with the serial port.
	 */
	private bindPortEvents() {
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

	private async onDataReady(data : number[]): Promise<void> {
		this.log.debug("onDataReady() called.");
		let datagramString: string = this.toHexStringDatagram(data);

		// check length and checksum
		if (data.length == 5 && this.hasRightChecksum(data)) {
			this.log.debug(`Checksum of datagram ${datagramString} is correct.`);
			if (this.decodeSender(data[0]) == "MainUnit") {
				// TODO: Temporary code for experimentation
				let reading: number = data[3];
				switch (data[2]) {
					case 0x29:
						let objectId = "Readings.fanSpeed";
						let fanSpeedValue = this.decodeFanSpeed(data[3]);

						try {
							let hasChangedState = await this.setStateChangedAsync(objectId, {val: fanSpeedValue, ack: true});
							this.log.debug(`Object ${objectId} state changed: ${hasChangedState}`);
						} catch (err) {
							this.log.error(`Unable to change state of ${objectId}: ${err}`);
						}

						

						break;
					case 0xA3:
						
						let powerState: boolean = (reading & 0x01) != 0;
						let serviceReminder: boolean = (reading & 0x80) != 0;
						this.log.debug(`power: ${powerState}, serviceReminder: ${serviceReminder}`);
						await this.setStateAsync("Readings.power", { val: powerState, ack: false });
						await this.setStateAsync("Readings.serviceReminder", { val: serviceReminder, ack: false });
						break;

				
					default:
						break;
				}
			} 
		} else {
			this.log.debug(`Checksum of datagram ${datagramString} is not correct.`);
		}
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	private async onReady(): Promise<void> {
		this.log.debug("onReady() called.");

		this.log.info(`Opening serial port ${this.config.serialPortDevice} at 9600 bit/s, 8 databits, no parity, 1 stop bit.`)
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

		this.buildDatagramStateMap();

		// TODO: Build object structure for commands (see history for code examples)
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 */
	private onUnload(callback: () => void): void {
		try {
			this.log.debug("onUnload() called.");

			this.serialPort.pause;
			this.serialPort.close();

			this.log.info("cleaned everything up...");
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed object changes
	 */
	private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
		this.log.debug("onObjectChange() called.");
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
		this.log.debug("onStateChange() called.");
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}


	// ////////////////////////////////////////////////////////////////
	// Section with local helpers
	// ////////////////////////////////////////////////////////////////
	private buildDatagramStateMap(): void {
		for (let obj of this.ioPack.instanceObjects) {
			let codes = obj?.common?.custom?.fieldCodes || [];
			for (let code of codes) {
				let bitPatternValue: number | undefined = (!!obj?.common?.custom?.fieldBitPattern) ?
					parseInt(obj.common.custom.fieldBitPattern) : undefined;
				this.datagramStateMap.push({ fieldCode: +code, fieldBitPattern: bitPatternValue, id: obj._id });
			}
		}
	}

	// ////////////////////////////////////////////////////////////////
	// Section with datagram functions
	// TODO: Put these function in a separate Utils class
	// ////////////////////////////////////////////////////////////////
	private hasRightChecksum(data: number[]): boolean {
		let checksumCalculated : number = (data[0]+data[1]+data[2]+data[3]+0x01) & 0xFF;
    	return (checksumCalculated == data[4]);
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

	private decodeFanSpeed(reading: number): number | undefined {
		let fanSpeed: number = Math.log2(reading + 1);
		return Number.isInteger(fanSpeed) ? fanSpeed : undefined;
	};

}

if (module.parent) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<ioBroker.AdapterOptions> | undefined) => new ValloxSerial(options);
} else {
	// otherwise start the instance directly
	(() => new ValloxSerial())();
}