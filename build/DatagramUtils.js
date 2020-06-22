"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatagramUtils = void 0;
class DatagramUtils {
    /**
     * Checks whether the checksum is correct with respect to the
     * four first bytes.
     * @param data 6 byte datagram. The last byte is the checksum
     */
    static hasRightChecksum(data) {
        let checksumCalculated = (data[0] + data[1] + data[2] + data[3] + data[4]) & 0xFF;
        return (checksumCalculated == data[5]);
    }
    /**
     * Calculates checksum and adds it at the 6. position (index: 5).
     * @param data 5 or 6 byte datagram.
     */
    static addChecksum(data) {
        let checksum = (data[0] + data[1] + data[2] + data[3] + data[4]) & 0xFF;
        data[5] = checksum;
        return checksum;
    }
    /**
     * Converts a given byte to a string in hexadecimal notation. If the given
     * number translates to more than one byte (> 255) the least significant
     * byte is encoded.
     * @param byte the byte that should be converted.
     * @param prefix if true, a 0x is prefixed. if false no prefix is added.
     */
    static toHexString(byte, prefix = false) {
        return (prefix ? "0x" : "") + (("0" + (byte & 0xFF).toString(16)).slice(-2)).toUpperCase();
    }
    /**
     * Converts the given byte array to a string with hexadecimal notation.
     * @see toHexString
     * @param bytes the array of bytes to convert
     * @param prefix if true, a 0x is prefixed to each byte.. if false no prefix is added.
     */
    static toHexStringDatagram(bytes, prefix = false) {
        let result = "";
        if (bytes == null) {
            result = "null";
        }
        else {
            bytes.forEach(b => {
                result += DatagramUtils.toHexString(b, prefix) + " ";
            });
        }
        return result.trimRight();
    }
    /**
     * For type safety the possible datagramm senders and receivers are used in
     * types {DatagramSender} and {DatagramReceiver}.
     * This method translates an encoded address to a value of these types.
     * @see encodeControlUnitToAddress
     * @param addr encoded address to be mapped to a sender or receiver (group)
     */
    static decodeAddressToControlUnit(addr) {
        return (addr >= 0x21 && addr <= 0x29) ? ("Panel_" + (addr - 0x20)) :
            (addr == 0x10) ? "All" :
                (addr == 0x11) ? "MainUnit" :
                    (addr == 0x20) ? "All Panels" :
                        undefined;
    }
    /**
     * Translates a given sender or receiver (group) to an code that can be used
     * in datagrams.
     * If an invalid value is given, code 0x00 is returned.
     * @see decodeAddressToControlUnit
     * @param cu decoded datagram sender or receiver (group) to be translated to code
     */
    static encodeControlUnitToAddress(cu) {
        return (cu === undefined) ? 0x00 :
            cu.startsWith("Panel") ? 0x20 + parseInt(cu.substr(6, 1)) :
                (cu == "All") ? 0x10 :
                    (cu == "MainUnit") ? 0x11 :
                        (cu == "All Panels") ? 0x20 :
                            0x00; // invalid address
    }
    /**
     * This method maps the name of a value type to the appropriate
     * decodeX from this Util class.
     * If an unknown functionName is given the reference to decodeIdentity
     * is returned.
     * @param functionName one of fanSpeed, onOff, humidity, temperature, identity (case insensitive)
     */
    static getDecodeFunctionByName(functionName) {
        var _a;
        let fn = (_a = functionName === null || functionName === void 0 ? void 0 : functionName.toLowerCase()) === null || _a === void 0 ? void 0 : _a.trim();
        const result = (fn == "fanspeed") ? DatagramUtils.decodeFanSpeed :
            (fn == "onoff") ? DatagramUtils.decodeOnOff :
                (fn == "humidity") ? DatagramUtils.decodeHumidity :
                    (fn == "temperature") ? DatagramUtils.decodeTemperature :
                        DatagramUtils.decodeIdentity;
        return (!!result) ? result : DatagramUtils.decodeIdentity;
    }
    /**
     * This method maps the name of a value type to the appropriate
     * encodeX from this Util class.
     * If an unknown functionName is given the reference to decodeIdentity
     * is returned.
     * @param functionName one of fanSpeed, onOff, humidity, temperature, identity (case insensitive)
     */
    static getEncodeFunctionByName(functionName) {
        var _a;
        let fn = (_a = functionName === null || functionName === void 0 ? void 0 : functionName.toLowerCase()) === null || _a === void 0 ? void 0 : _a.trim();
        const result = (fn == "fanspeed") ? DatagramUtils.encodeFanSpeed :
            //(fn == "onoff") ? DatagramUtils.encodeOnOff : // TODO: think about this can be done (stateful set of bit in data word with multiple switches)
            (fn == "humidity") ? DatagramUtils.encodeHumidity :
                (fn == "temperature") ? DatagramUtils.encodeTemperature :
                    DatagramUtils.encodeIdentity;
        return (!!result) ? result : DatagramUtils.encodeIdentity;
    }
    /**
     * Function returning the passed value.
    */
    static decodeIdentity(reading) {
        return reading;
    }
    /**
     * Function returning the passed value.
    */
    static encodeIdentity(reading) {
        return reading;
    }
    /**
     * Translates the encoded fan speed to a decimal between 0 and 8.
     * Incorrect encodings result in undefined.
     * @see encodeFanSpeed
     * @param reading the encoded fan speed
     */
    static decodeFanSpeed(reading) {
        let fanSpeed = Math.log2(reading + 1);
        return Number.isInteger(fanSpeed) ? fanSpeed : undefined;
    }
    /**
     * Encodes fan speed values between 0 to 8. For invalid numbers
     * 0 is returned.
     * @see decodeFanSpeed
     * @param setvalue a number 0 <= n <= 8
     */
    static encodeFanSpeed(setvalue) {
        return (setvalue >= 0 && setvalue <= 8) ? (0x1 << setvalue) - 1 : 0;
    }
    /**
     * Some on/off information is given in a bit at a certain position in
     * a byte. This function takes the byte and a bit pattern and returns
     * true if one of the bits identified by the bit pattern is true.
     * @param reading the byte to read certain bits from
     * @param fieldBitPattern the bit pattern that is applied with bitwise AND.
     */
    static decodeOnOff(reading, fieldBitPattern) {
        return (reading & fieldBitPattern) != 0;
    }
    /**
     * Temperature values have a non-linear proprietary mapping.
     * This function translates an encoded temparature value to
     * a °C value.
     * @param sensorValue the encoded temperature value
     */
    static decodeTemperature(sensorValue) {
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
            100, 100, 100, 100, 100, 100]; // 0xFA - 0xFF
        return temperatureMap[sensorValue];
    }
    /**
     * This function translates a °C temperature to an encoded
     * value that can be sent to the ventilation unit.
     * @see decodeTemperature
     * @param celsius is a temperature between -74°C and 100°C (both boundaries included)
     */
    static encodeTemperature(celsius) {
        let result = undefined;
        if (-74 <= celsius && celsius <= 100) {
            let h = (celsius >= 10) ? 0x83 : 0x00; // skip values that are unlikely to be set, if possible
            for (; h <= 0xF7; h++) {
                let nextTemperature = DatagramUtils.decodeTemperature(h);
                if ((nextTemperature != undefined) &&
                    (nextTemperature >= celsius)) {
                    result = h;
                    break;
                }
            }
        }
        return result;
    }
    /**
     * Relative humidity values need to be according to the formula
     * (value - 51) / 2.04 and it will result in a value between 0%
     * and 100%.
     * @param reading the encoded humidity value
     */
    static decodeHumidity(reading) {
        let result = (reading - 51) / 2.04;
        return ((result >= 0) && (result <= 100)) ? result : undefined;
    }
    /**
     * Relative humidity values need to be according to the formula
     * (value - 51) / 2.04 and it will result in a value between 0%
     * and 100%.
     * @param value the value between 0 and 100 that should be encoded
     */
    static encodeHumidity(value) {
        let result = ((value >= 0) && (value <= 100)) ?
            Math.round((value * 2.04) + 51) :
            undefined;
        return result;
    }
    /**
     * Build a 6-byte datagram that can be send in order to issue a command.
     *
     * @param commandConfig
     * @param value
     * @param senderAddress
     */
    static getDatagramForCommand(commandConfig, value, senderAddress) {
        var _a, _b, _c;
        let datagram = null;
        let domainCode = 0x01; // Domain, always 0x01
        let senderCode = DatagramUtils.encodeControlUnitToAddress(senderAddress);
        let receiverCode = 0x11;
        let fieldCode = (_a = commandConfig === null || commandConfig === void 0 ? void 0 : commandConfig.custom) === null || _a === void 0 ? void 0 : _a.fieldCodes[0]; // TODO: convert to number
        // validate value and 
        let isValidValue = (value != null);
        if (!!commandConfig.min && typeof (commandConfig.min) === "number") { // TODO: Ausdruck umstellen, sodass er bei min:0 nicht false wird
            isValidValue = isValidValue && typeof (value) === "number" && commandConfig.min <= value;
        }
        if (!!commandConfig.max && typeof (commandConfig.max) === "number") { // TODO: Ausdruck umstellen, sodass er bei max:0 nicht false wird
            isValidValue = isValidValue && typeof (value) === "number" && commandConfig.max <= value;
        }
        let encodedValue = undefined;
        if (isValidValue && ((_b = commandConfig === null || commandConfig === void 0 ? void 0 : commandConfig.custom) === null || _b === void 0 ? void 0 : _b.encoding) != undefined) {
            let encodingFunction = DatagramUtils.getEncodeFunctionByName((_c = commandConfig === null || commandConfig === void 0 ? void 0 : commandConfig.custom) === null || _c === void 0 ? void 0 : _c.encoding);
            encodedValue = encodingFunction(value);
        }
        if (!!domainCode && !!senderCode && !!receiverCode && !!fieldCode && !!encodedValue) {
            datagram = [
                domainCode,
                senderCode,
                receiverCode,
                fieldCode,
                encodedValue
            ];
            DatagramUtils.addChecksum(datagram);
        }
        return datagram;
    }
}
exports.DatagramUtils = DatagramUtils;
//# sourceMappingURL=DatagramUtils.js.map