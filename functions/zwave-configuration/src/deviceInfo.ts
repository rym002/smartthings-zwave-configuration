import axios from 'axios'
import { DynamoDB } from 'aws-sdk'
import { memoize } from 'lodash'

export interface ManufacturerHex {
    productTypeId: string
    manufacturerId: string
    productId: string
}

export interface CommandClass {
    Name: string
    Identifier: string
}
export interface AssociationGroup {
    Description: string
    GroupNumber: number
    MaximumNodes: number
    endpoint_id: number
    group_name: string
    profile: string
}
interface ConfigurationParameterValue {
    From: number
    To: number,
    Description: string,
    DescriptionJSONSafe: string
}
export interface ConfigurationParameter {
    Name: string
    Description: string
    ParameterNumber: number
    Size: number
    DefaultValue: number
    pType: number
    flagReadOnly: boolean
    flagReInclude: boolean
    flagAdvanced: boolean
    v3plus: boolean
    minValue: number
    maxValue: number
    ConfigurationParameterValues: ConfigurationParameterValue[]
}
interface Feature {
    feature_Id: number
    product_Id: number
    option_value_bool: boolean
    option_value_text: string
    option_value_selections: string[]
    feature_Type: string
    featureName: string
    featureDescription: string
    featurePrompt: string
}
interface Document {
    Id: number
    product_id: number
    Type: number
    description: string
    value: string
    not_public: boolean
}
interface Text {
    Id: number
    product_id: number
    Type: number
    description: string
    value: string
}

export interface ZWaveInfo {
    Id: number
    Name: string
    Description: string
    Description_Short: string
    Brand: string
    Identifier: string
    CertificationNumber: string
    OemVersion: string
    HardwarePlatform: string
    ZWaveVersion: string
    LibraryType: string
    DeviceType: string
    RoleType: string
    ManufacturerId: string
    ProductTypeId: string
    ProductId: string
    Frequencies: string[]
    UserIcon: string
    InstallerIcon: string
    ProductUrl: string
    SupportUrl: string
    CertificationApprovedDate: string
    Categories: string[]
    SupportedCommandClasses: CommandClass[]
    ControlledCommandClasses: CommandClass[]
    S2Classes: CommandClass[]
    AssociationGroups: AssociationGroup[]
    ConfigurationParameters: ConfigurationParameter[]
    Features: Feature[]
    Documents: Document[]
    Texts: Text[]
    SupportedMultilevelSensors: string[]
    ControlledMultilevelSensors: string[]
    SupportedNotificationTypes: string[]
    ControlledNotificationTypes: string[]
    SupportedControlledMeterTypes: string[]
    Supports_NWI: boolean
    Supports_Explorer: boolean
    is_FLiRS: boolean
    Supports_SmartStart: boolean
}

export interface ProductIdKey {
    id: string
}
export interface ProductIdMap extends ProductIdKey {
    zWaveId: number
}

class ProductMapService {
    readonly ZWAVE_PRODUCT_TABLE = process.env.zwave_product_map_table || 'zwave_product_map'

    private _db(): DynamoDB {
        return new DynamoDB()
    }
    db = memoize(this._db)

    async save(deviceManufacturerCode: string, productId: number) {
        const record: ProductIdMap = {
            id: deviceManufacturerCode,
            zWaveId: productId
        }
        const dynamoRecord = DynamoDB.Converter.marshall(record)
        await this.db().putItem({
            Item: dynamoRecord,
            TableName: this.ZWAVE_PRODUCT_TABLE
        }).promise()
    }
    async get(deviceManufacturerCode: string): Promise<ProductIdMap> {
        const idKey: ProductIdKey = {
            id: deviceManufacturerCode
        }
        const key = DynamoDB.Converter.marshall(idKey)
        const resp = await this.db().getItem({
            TableName: this.ZWAVE_PRODUCT_TABLE,
            Key: key
        }).promise()
        if (resp.Item) {
            return <ProductIdMap>DynamoDB.Converter.unmarshall(resp.Item)
        } else {
            throw new Error('Product Not Found')
        }
    }
}

export const productService = new ProductMapService()

export class ZwaveDeviceInfo {
    constructor(readonly zwaveProductId: number) {

    }
    deviceImage(): string {
        return this.deviceImageUrl(this.zwaveProductId, 21)
    }

    deviceImageUrl(product_id: number, type: number) {
        return `https://products.z-wavealliance.org/ProductImages/ProductImage?prod=${product_id}&which=${type}`
    }
    async productPicture(): Promise<string> {
        const documents = (await this.deviceInfo()).Documents
        const pictureDocuments = documents.filter(document => {
            return document.Type = 21
        })
        if (pictureDocuments) {
            return this.deviceImageUrl(pictureDocuments[0].product_id, pictureDocuments[0].Type)
        } else {
            return this.deviceImageUrl(this.zwaveProductId, 21)
        }
    }

    async productManual(): Promise<string | undefined> {
        const documents = (await this.deviceInfo()).Documents
        const manualDocuments = documents.filter(document => {
            return document.Type == 1
        })

        if (manualDocuments && manualDocuments.length) {
            return `https://products.z-wavealliance.org/ProductManual/File?folder=&filename=${manualDocuments[0].value}`
        }
    }

    private async _deviceInfo(): Promise<ZWaveInfo> {
        const url = `https://products.z-wavealliance.org/products/${this.zwaveProductId}/JSON`
        const resp = await axios.get<ZWaveInfo>(url)
        return resp.data
    }

    deviceInfo = memoize(this._deviceInfo.bind(this))

    private toFlatHex(value: string): string {
        return value.replace('0x', '')
    }
    public async deviceManufacturerCode(): Promise<string> {
        const deviceInfo = await this.deviceInfo()
        return `${this.toFlatHex(deviceInfo.ManufacturerId)}-${this.toFlatHex(deviceInfo.ProductTypeId)}-${this.toFlatHex(deviceInfo.ProductId)}`
    }
    async configurationParameter(parameter: number): Promise<ConfigurationParameter> {
        const info = await this.deviceInfo()
        const found = info.ConfigurationParameters.filter(configParameter => parameter == configParameter.ParameterNumber)
        if (found && found.length) {
            return found[0]
        }
        throw new Error(`Invalid Parameter ${parameter}`)
    }
    static async zwaveAllianceProductId(deviceManufacturerCode: string): Promise<number> {
        const product = await productService.get(deviceManufacturerCode)
        return product.zWaveId
    }

    async saveProductIdMap() {
        const deviceManufacturerCode = await this.deviceManufacturerCode()
        await productService.save(deviceManufacturerCode, this.zwaveProductId)
    }
}