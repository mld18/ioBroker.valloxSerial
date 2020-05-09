/**
 * Tests of static util methods in DatagramUtils.
 */

import { expect } from "chai"; 
import { DatagramUtils as dutils } from "../src/DatagramUtils";

describe("hasRightChecksum", () => {
	const datagram5BytesWithRightChecksum = [
		[0x21, 0x11, 0x00, 0xA3, 0xD6],
		[0x11, 0x21, 0xA3, 0x03, 0xD9],
		[0x21, 0x11, 0xA6, 0xFF, 0xD8]
	];

	// Test 5-Byte-Datagrams (Byte 1 with 0x01 is used for separation)
	for (let d of datagram5BytesWithRightChecksum) {
		it(`should have right checksum ${d[4]}`, () => {
			const result = dutils.hasRightChecksum(d);
			expect(result).to.be.true;
		});
	}


});

// ... more test suites => describe
