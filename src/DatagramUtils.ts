
export class DatagramUtils {

    
    public static hasRightChecksum(data: number[]): boolean {
		let checksumCalculated : number = (data[0]+data[1]+data[2]+data[3]+0x01) & 0xFF;
    	return (checksumCalculated == data[4]);
	}
}