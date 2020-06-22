import * as Stream from 'stream';

/**
 * This is a typescriptyfied version of the InterByteTimeoutParser from the original
 * serialport.io project.
 * Original source: https://github.com/serialport/node-serialport/blob/master/packages/parser-inter-byte-timeout/lib/index.js
 */

export interface InterByteTimeoutParserOption extends Stream.TransformOptions {
    maxBufferSize?: number;
    interval: number;
}

/**
 * Emits data if there is a pause between packets for the specified amount of time.
 * @extends Transform
 * @param {Object} options parser options object
 * @param {Number} options.interval the period of silence in milliseconds after which data is emited
 * @param {Number} options.maxBufferSize the maximum number of bytes after which data will be emited. Defaults to 65536.
 * @summary A transform stream that emits data as a buffer after not receiving any bytes for the specified amount of time.
 * @example
const SerialPort = require('serialport')
const InterByteTimeout = require('@serialport/parser-inter-byte-timeout')
const port = new SerialPort('/dev/tty-usbserial1')
const parser = port.pipe(new InterByteTimeout({interval: 30}))
parser.on('data', console.log) // will emit data if there is a pause between packets greater than 30ms
 */

export class SerialPortInterByteTimeoutParser extends Stream.Transform {
    maxBufferSize: number;
    currentPacket: any[];
    interval: number;
    intervalID: NodeJS.Timeout | undefined;
    
    public constructor(options: InterByteTimeoutParserOption) {
        super(options)
        if (options.maxBufferSize == undefined) {
            options.maxBufferSize = 65536;
        } 
        
        if (!options.interval) {
            throw new TypeError('"interval" is required');
        }

        if (typeof options.interval !== 'number' || Number.isNaN(options.interval)) {
            throw new TypeError('"interval" is not a number');
        }

        if (options.interval < 1) {
            throw new TypeError('"interval" is not greater than 0');
        }

        if (typeof options.maxBufferSize !== 'number' || Number.isNaN(options.maxBufferSize)) {
            throw new TypeError('"maxBufferSize" is not a number');
        }

        if (options.maxBufferSize < 1) {
            throw new TypeError('"maxBufferSize" is not greater than 0');
        }

        this.maxBufferSize = options.maxBufferSize;
        this.currentPacket = [];
        this.interval = options.interval;
        this.intervalID = undefined;
    }

    public _transform(chunk: any, encoding: string, callback: Stream.TransformCallback): void {
        if (!!this.intervalID) {
            clearTimeout(this.intervalID);
        }

        for (let offset = 0; offset < chunk.length; offset++) {
            this.currentPacket.push(chunk[offset])
            if (this.currentPacket.length >= this.maxBufferSize) {
                this.emitPacket();
            }
        }
        this.intervalID = setTimeout(this.emitPacket.bind(this), this.interval);
        callback();
    }

    public emitPacket(): void {
        if (!!this.intervalID) {
            clearTimeout(this.intervalID);
        }

        if (this.currentPacket.length > 0) {
            this.push(Buffer.from(this.currentPacket));
        }
        this.currentPacket = [];
    }

    public _flush(callback: Stream.TransformCallback): void {
        this.emitPacket()
        callback();
    }
}