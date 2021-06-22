import axios from 'axios'
import { createWriteStream } from 'fs'
interface DeviceInfo {
    Id?: string
    ManufacturerId: string
    ProductTypeId: string
    ProductId: string
}

async function download() {
    const deviceInfos: DeviceInfo[] = []
    for (let index = 0; index < 100; index++) {
        try {
            const resp = await axios.get<DeviceInfo>(`https://products.z-wavealliance.org/products/${index}/JSON`)
            const data = resp.data
            if (data.Id && data.ProductTypeId) {
                const deviceInfo: DeviceInfo = {
                    Id: data.Id,
                    ManufacturerId: data.ManufacturerId,
                    ProductId: data.ProductId,
                    ProductTypeId: data.ProductTypeId
                }
                deviceInfos.push(deviceInfo)
            } else {
                console.log('Not Found ' + index)
            }
        } catch (err) {
            console.log(err)
        }
    }
    return deviceInfos
}
async function writeData(deviceInfos: DeviceInfo[]) {
    const writeStream = createWriteStream('devices.csv', {
        flags: 'w'
    })
    writeStream.write('ProductTypeId,ManufacturerId,ProductId,Id\n')
    deviceInfos.forEach(deviceInfo => {
        writeStream.write(deviceInfo.ProductTypeId + ',' + deviceInfo.ManufacturerId + ',' + deviceInfo.ProductId + ',' + deviceInfo.Id + '\n')
    })
    writeStream.close()

}
console.log('Start')
download()
    .then(deviceInfos => {
        writeData(deviceInfos)
        console.log('Done')
    })