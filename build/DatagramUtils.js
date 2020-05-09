"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class DatagramUtils {
    static hasRightChecksum(data) {
        let checksumCalculated = (data[0] + data[1] + data[2] + data[3] + 0x01) & 0xFF;
        return (checksumCalculated == data[4]);
    }
}
exports.DatagramUtils = DatagramUtils;
//# sourceMappingURL=DatagramUtils.js.map