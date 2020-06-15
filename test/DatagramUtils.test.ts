/**
 * Tests of static util methods in DatagramUtils.
 */

import { expect } from "chai"; 
import { DatagramUtils as dutils, DatagramSender, DatagramReceiver } from "../src/DatagramUtils";

describe("DatagramUtils", function() {
	describe(".hasRightChecksum", function() {
		const datagram5BytesWithRightChecksum = [
			[0x21, 0x11, 0x00, 0xA3, 0xD6],
			[0x11, 0x21, 0xA3, 0x03, 0xD9],
			[0x21, 0x11, 0xA6, 0xFF, 0xD8]
		];
	
		// Test 5-Byte-Datagrams (Byte 1 with 0x01 is used for separation)
		for (let d of datagram5BytesWithRightChecksum) {
			it(`should have right checksum ${d[4]}`, function() {
				const result = dutils.hasRightChecksum(d);
				expect(result).to.be.true;
			});
		}
	}); 

	describe(".addChecksum", function() {
		const datagrams5Bytes = [
			{datagram: [0x01, 0x21, 0x11, 0x00, 0xA3], rightChecksum: 0xD6},
			{datagram: [0x01, 0x11, 0x21, 0xA3, 0x03], rightChecksum: 0xD9},
			{datagram: [0x01, 0x21, 0x11, 0xA6, 0xFF], rightChecksum: 0xD8}, 
			{datagram: [0x01, 0x21, 0x11, 0xA6, 0xFF, 0xEE], rightChecksum: 0xD8}
		];

		for (let d of datagrams5Bytes) {
			it(`should calculate and return right checksum ${d.rightChecksum}`, function() {
				const result = dutils.addChecksum(d.datagram);
				expect(result).to.equal(d.rightChecksum);
			});

			it(`should insert right checksum at the end ${d.rightChecksum}`, function() {
				dutils.addChecksum(d.datagram);
				expect(d.datagram).not.empty;
				expect(d.datagram).has.length(6);
				expect(d.datagram[5]).to.equal(d.rightChecksum);
			});
		}	
	});

	describe(".toHexString", function() {
		it(`should return two digit hexadecimal numbers with uppercase letters`, function() {
			expect(dutils.toHexString(0)).to.equal("00");
			expect(dutils.toHexString(1)).to.equal("01");
			expect(dutils.toHexString(15)).to.equal("0F");
			expect(dutils.toHexString(255)).to.equal("FF");
		});

		it(`should add 0x as a prefix`, function() {
			expect(dutils.toHexString(0, true)).to.equal("0x00");
			expect(dutils.toHexString(255, true)).to.equal("0xFF");
		});

		it(`should encode only the least significant byte`, function() {
			expect(dutils.toHexString(256)).to.equal("00");
		});
	});

	describe(".toHexStringDatagram", function() {
		const testset = [
			{bytes: [], prefix: false, expected: ""},
			{bytes: [], prefix: true, expected: ""},
			{bytes: [0], prefix: false, expected: "00"},
			{bytes: [255], prefix: true, expected: "0xFF"},
			{bytes: [8,9,10,11,12,13,14,15,16], prefix: false, expected: "08 09 0A 0B 0C 0D 0E 0F 10"}
		];

		it(`should translate each byte separated by blank`, function() {
			for (let t of testset) {
				const result = dutils.toHexStringDatagram(t.bytes, t.prefix);
				expect(result).to.equal(t.expected);
			}
		});
	});

	describe(".decodeAddressToControlUnit", function() {
		const testsetPositive = [
			{input: 0x10, expected: "All"},
			{input: 0x11, expected: "MainUnit"},
			{input: 0x20, expected: "All Panels"},
			{input: 0x21, expected: "Panel_1"},
			{input: 0x22, expected: "Panel_2"},
			{input: 0x23, expected: "Panel_3"},
			{input: 0x29, expected: "Panel_9"}
		];

		const testsetNegative = [
			{input: 0x00},
			{input: 0x0F},
			{input: 0x12},
			{input: 0x1F},
			{input: 0x2A},
			{input: 9999999999}
		];

		it(`should translate all possible control unit codes`, function() {
			for (let t of testsetPositive) {
				const result = dutils.decodeAddressToControlUnit(t.input);
				expect(result).to.equal(t.expected);
			}
		});

		it(`should return 'undefined' for undefined inputs`, function() {
			for (let t of testsetNegative) {
				const result = dutils.decodeAddressToControlUnit(t.input);
				expect(result).to.be.undefined;
			}
		});
	});

	describe(".encodeControlUnitToAddress", function() {
		const testsetPositive = [
			{input: "All", expected: 0x10},
			{input: "MainUnit", expected: 0x11},
			{input: "All Panels", expected: 0x20},
			{input: "Panel_1", expected: 0x21},
			{input: "Panel_2", expected: 0x22},
			{input: "Panel_3", expected: 0x23},
			{input: "Panel_9", expected: 0x29}
		];

		const testsetNegative = [
			{input: ""},
			{input: "Horst"},
			{input: undefined}
		];

		it(`should find encodings for all given senders/receivers`, function() {
			for (let t of testsetPositive) {
				const result = dutils.encodeControlUnitToAddress(<DatagramReceiver>t.input);
				expect(result).to.equal(t.expected);
			}
		});

		it(`should return '0x00' for undefined inputs`, function() {
			for (let t of testsetNegative) {
				const result = dutils.encodeControlUnitToAddress(<DatagramReceiver>t.input);
				expect(result).to.equal(0x00);
			}
		});
	});

	describe("nest decodeAddressToControlUnit and encodeControlUnitToAddress yields identity", function() {
		it(`should return identity if decodeAddressToControlUnit(encodeControlUnitToAddress(i))`, function() {
			for (let dr of <DatagramReceiver[]>["All", "All Panels", "MainUnit" , "Panel_1" , "Panel_2" , "Panel_3" , "Panel_4" , "Panel_5" , "Panel_6" , "Panel_7" , "Panel_8" , "Panel_9"]) {
				expect(dutils.decodeAddressToControlUnit(dutils.encodeControlUnitToAddress(dr))).to.equal(dr);
			}
		});

		it(`should return identity if encodeControlUnitToAddress(decodeAddressToControlUnit(i))`, function() {
			for (let i of [0x10, 0x11, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29]) {
				expect(dutils.encodeControlUnitToAddress(dutils.decodeAddressToControlUnit(i))).to.equal(i);
			}
		});
	});

	describe(".decodeIdentity", function() {
		const testset = [
			{input: []},
			{input: null},
			{input: "42"},
			{input: [255]},
			{input: true},
			{input: 3.14}
		];

		it(`should always return the passed value`, function() {
			for (let t of testset) {
				const result = dutils.decodeIdentity(t.input);
				expect(result).to.equal(t.input);
			}
		});
	});

	describe(".encodeIdentity", function() {
		const testset = [
			{input: []},
			{input: null},
			{input: "42"},
			{input: [255]},
			{input: true},
			{input: 3.14}
		];

		it(`should always return the passed value`, function() {
			for (let t of testset) {
				const result = dutils.encodeIdentity(t.input);
				expect(result).to.equal(t.input);
			}
		});
	});

	describe("nest decodeIdentity and encodeIdentity yields identity", function() {
		it(`should return identity if decodeIdentity(encodeIdentity(i))`, function() {
			let items = [null, 0, '', 'test', -1, Math.abs]
			for (let i of items) {
				expect(dutils.decodeIdentity(dutils.encodeIdentity(i))).to.equal(i);
			}
		});

		it(`should return identity if encodeIdentity(decodeIdentity(i))`, function() {
			for (let h=0; h<=0xFF; h++) {
				expect(dutils.encodeIdentity(<number> dutils.decodeIdentity(h))).to.equal(h);
			}
		});
	});

	describe(".decodeFanSpeed", function() {
		const testsetPositive = [
			{input: 0x00, expected: 0},
			{input: 0x01, expected: 1},
			{input: 0x03, expected: 2},
			{input: 0x07, expected: 3},
			{input: 0x0F, expected: 4},
			{input: 0x1F, expected: 5},
			{input: 0x3F, expected: 6},
			{input: 0x7F, expected: 7},
			{input: 0xFF, expected: 8},
		];

		const testsetNegative = [
			{input: 0x02},
			{input: 0x0A},
			{input: 9999999999}
		];

		it(`should translate all possible encoded fan speeds`, function() {
			for (let t of testsetPositive) {
				const result = dutils.decodeFanSpeed(t.input);
				expect(result).to.equal(t.expected);
			}
		});

		it(`should return 'undefined' for undefined inputs`, function() {
			for (let t of testsetNegative) {
				const result = dutils.decodeFanSpeed(t.input);
				expect(result).to.be.undefined;
			}
		});
	});

	describe(".encodeFanSpeed", function() {
		const testsetPositive = [
			{input: 0, expected: 0x00},
			{input: 1, expected: 0x01},
			{input: 2, expected: 0x03},
			{input: 3, expected: 0x07},
			{input: 4, expected: 0x0F},
			{input: 5, expected: 0x1F},
			{input: 6, expected: 0x3F},
			{input: 7, expected: 0x7F},
			{input: 8, expected: 0xFF},
		];

		const testsetNegative = [
			{input: -1},
			{input: 9},
			{input: 9999999999}
		];

		it(`should translate all possible fan speeds`, function() {
			for (let t of testsetPositive) {
				const result = dutils.encodeFanSpeed(t.input);
				expect(result).to.equal(t.expected);
			}
		});

		it(`should return 0 for undefined inputs`, function() {
			for (let t of testsetNegative) {
				const result = dutils.encodeFanSpeed(t.input);
				expect(result).to.equal(0);
			}
		});
	});

	describe("nest decodeFanSpeed and encodeFanSpeed yields identity", function() {
		it(`should return identity if decodeFanSpeed(encodeFanSpeed(i))`, function() {
			for (let i=0; i<=8; i++) {
				expect(dutils.decodeFanSpeed(dutils.encodeFanSpeed(i))).to.equal(i);
			}
		});

		it(`should return identity if encodeFanSpeed(decodeFanSpeed(i))`, function() {
			for (let h=0xFF; h>=0xFF; h=(1>>h)) {
				expect(dutils.encodeFanSpeed(<number> dutils.decodeFanSpeed(h))).to.equal(h);
			}
		});
	});

	describe(".decodeOnOff", function() {
		const testsetNegative = [
			{byte: 0, bitpattern: 0xFF, expected: false},
			{byte: 0xAA, bitpattern: 0x55, expected: false},
		];

		it(`should always return true if value == bit pattern`, function() {
			for (let i=1; i<255; i++) {
				expect(dutils.decodeOnOff(i, i)).to.be.true;
			}
		});

		it(`should return false if no bit is matched`, function() {
			for (let t of testsetNegative) {
				expect(dutils.decodeOnOff(t.byte, t.bitpattern)).to.be.false;
			}
		});
	});

	describe(".decodeTemperature", function() {
		const testsetPositive = [
			{input: 0x00, expected: -74},
			{input: 0xD3, expected: 45},
			{input: 0xD4, expected: 45},
			{input: 0xF7, expected: 100},
			{input: 0xFF, expected: 100}
		];

		const testsetNegative = [
			{input: -1},
			{input: 9999999999}
		];

		it(`should translate encoded temperatures to °C values`, function() {
			for (let t of testsetPositive) {
				const result = dutils.decodeTemperature(t.input);
				expect(result).to.equal(t.expected);
			}
		});

		it(`should return 'undefined' for unknown values`, function() {
			for (let t of testsetNegative) {
				const result = dutils.decodeTemperature(t.input);
				expect(result).to.be.undefined;
			}
		}); 
	});

	describe(".encodeTemperature", function() {
		const testsetPositive = [
			{input: -74, expected: 0x00},
			{input: -73, expected: 0x01},
			{input: -31, expected: 0x1A},
			{input: 24.1, expected: 0xAD},
			{input: 0, expected: 0x64},
			{input: 1, expected: 0x67},
			{input: 45, expected: 0xD3},
			{input: 100, expected: 0xF7}
		];

		const testsetNegative = [
			{input: -75},
			{input: 101},
			{input: 9999999999}
		];

		it(`should encode °C temperatures to the least code in the mapping table`, function() {
			for (let t of testsetPositive) {
				const result = dutils.encodeTemperature(t.input);
				expect(result).to.equal(t.expected);
			}
		});

		it(`should return 'undefined' for unknown values`, function() {
			for (let t of testsetNegative) {
				const result = dutils.encodeTemperature(t.input);
				expect(result).to.be.undefined;
			}
		}); 
	});

	describe("nest decodeTemperature and encodeTemperature yields identity", function() {
		it(`should return identity if decodeFanSpeed(encodeFanSpeed(i))`, function() {
			for (let c=-44; c<=57; c++) {
				expect(dutils.decodeTemperature(<number> dutils.encodeTemperature(c))).to.equal(c);
			}
		});

		it(`should return approximate identity (only fuzzy mapping) if encodeTemperature(decodeTemperature(i))`, function() {
			for (let h=0x00; h<=0xF8; h++) {
				let delta = Math.abs(<number> dutils.decodeTemperature(h))<=10 ? 3 : 2;
				expect(dutils.encodeTemperature(<number> dutils.decodeTemperature(h))).to.be.approximately(h, delta);
			}
		});
	});

	describe(".decodeHumidity", function() {
		const testsetPositive = [
			{input: 255, expected: 100.0},
			{input: 51, expected: 0.0},
			{input: 153, expected: 50.0},
			{input: 102, expected: 25.0},
			{input: 204, expected: 75.0}
		];

		const testsetNegative = [
			{input: -1},
			{input: 0},
			{input: 50},
			{input: 9999999999}
		];

		it(`should translate encoded humidity values to %RH values`, function() {
			for (let t of testsetPositive) {
				const result = dutils.decodeHumidity(t.input);
				expect(result).to.equal(t.expected);
			}
		});

		it(`should return 'undefined' for unknown values`, function() {
			for (let t of testsetNegative) {
				const result = dutils.decodeHumidity(t.input);
				expect(result).to.be.undefined;
			}
		}); 
	});

	describe(".encodeHumidity", function() {
		const testsetPositive = [
			{input: 100.0, expected: 255},
			{input: 0.0, expected: 51},
			{input: 50.0, expected: 153},
			{input: 25.0, expected: 102},
			{input: 75.0, expected: 204}
		];

		const testsetNegative = [
			{input: -1},
			{input: 101},
			{input: 9999999999}
		];

		it(`should translate %RH values to encoded humidity values`, function() {
			for (let t of testsetPositive) {
				const result = dutils.encodeHumidity(t.input);
				expect(result).to.equal(t.expected);
			}
		});

		it(`should return 'undefined' for unknown values`, function() {
			for (let t of testsetNegative) {
				const result = dutils.encodeHumidity(t.input);
				expect(result).to.be.undefined;
			}
		}); 
	});

	describe("nest decodeHumidity and encodeHumidity yields identity", function() {
		it(`should return identity if decodeHumidity(encodeHumidity(i))`, function() {
			for (let i=0; i<=100; i++) {
				expect(Math.round(<number> dutils.decodeHumidity(<number> dutils.encodeHumidity(i)))).to.equal(i);
			}
		});

		it(`should return identity if encodeHumidity(decodeHumidity(i))`, function() {
			for (let j=51; j<=255; j++) {
				expect(dutils.encodeHumidity(<number> dutils.decodeHumidity(j))).to.equal(j);
			}
		});
	});

	describe(".getDecodeFunctionByName", function() {
		const testsetPositive1 = [
			{input: "fanSpeed", expected: dutils.decodeFanSpeed},
			{input: "onOff", expected: dutils.decodeOnOff},
			{input: "humidity", expected: dutils.decodeHumidity},
			{input: "temperature", expected: dutils.decodeTemperature},
			{input: "identity", expected: dutils.decodeIdentity}
		];

		const testsetPositiveCaseAndBlanks = [
			{input: "FANSPEED", expected: dutils.decodeFanSpeed},
			{input: " FANSPEED ", expected: dutils.decodeFanSpeed}
		];

		const testsetNegative = [
			{input: ""},
			{input: "Whatever"}
		];

		it(`should return the proper decode method`, function() {
			for (let t of testsetPositive1) {
				const result = dutils.getDecodeFunctionByName(t.input);
				expect(result).to.equal(t.expected);
			}
		});

		it(`should ignore blanks and upper/lower case`, function() {
			for (let t of testsetPositiveCaseAndBlanks) {
				const result = dutils.getDecodeFunctionByName(t.input);
				expect(result).to.equal(t.expected);
			}
		});

		it(`should return 'decodeIdentity' for unknown values`, function() {
			for (let t of testsetNegative) {
				const result = dutils.getDecodeFunctionByName(t.input);
				expect(result).to.equal(dutils.decodeIdentity);
			}
		}); 
	});

	describe(".getEncodeFunctionByName", function() {
		const testsetPositive1 = [
			{input: "fanSpeed", expected: dutils.encodeFanSpeed},
			{input: "humidity", expected: dutils.encodeHumidity},
			{input: "temperature", expected: dutils.encodeTemperature},
			{input: "identity", expected: dutils.encodeIdentity}
		];

		const testsetPositiveCaseAndBlanks = [
			{input: "FANSPEED", expected: dutils.encodeFanSpeed},
			{input: " FANSPEED ", expected: dutils.encodeFanSpeed}
		];

		const testsetNegative = [
			{input: ""},
			{input: "Whatever"},
			{input: "onoff"}     // setting is done through bit pattern, i.e. no stateless set is possible
		];

		it(`should return the proper encode method`, function() {
			for (let t of testsetPositive1) {
				const result = dutils.getEncodeFunctionByName(t.input);
				expect(result).to.equal(t.expected);
			}
		});

		it(`should ignore blanks and upper/lower case`, function() {
			for (let t of testsetPositiveCaseAndBlanks) {
				const result = dutils.getEncodeFunctionByName(t.input);
				expect(result).to.equal(t.expected);
			}
		});

		it(`should return 'encodeIdentity' for unknown values`, function() {
			for (let t of testsetNegative) {
				const result = dutils.getEncodeFunctionByName(t.input);
				expect(result).to.equal(dutils.encodeIdentity);
			}
		}); 
	});
});
