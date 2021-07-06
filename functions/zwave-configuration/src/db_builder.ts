import axios from 'axios'
import { createWriteStream, WriteStream } from 'fs'
interface DeviceInfo {
    Id?: string
    ManufacturerId: string
    ProductTypeId: string
    ProductId: string
}

async function download() {
    const ws = openStream()
    try {
        for (let index = 0; index < 10000; index++) {
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
                    ws.write(deviceInfo.ProductTypeId + ',' + deviceInfo.ManufacturerId + ',' + deviceInfo.ProductId + ',' + deviceInfo.Id + '\n')
                } else {
                    console.log('Not Found ' + index)
                }
            } catch (err) {
                console.log(err)
            }
        }
    } finally {
        ws.close()
    }
}

function openStream(): WriteStream {
    const writeStream = createWriteStream('devices.csv', {
        flags: 'w'
    })
    writeStream.write('ProductTypeId,ManufacturerId,ProductId,Id\n')
    return writeStream

}
console.log('Start')
download()
    .then(() => {
        console.log('Done')
    })