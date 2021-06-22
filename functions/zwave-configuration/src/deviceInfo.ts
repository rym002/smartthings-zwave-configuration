import axios from 'axios'

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

export class ZwaveDevice {
    private zwaveInfo?: ZWaveInfo
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
            return document.description = "Product Picture"
        })
        if (pictureDocuments) {
            return this.deviceImageUrl(pictureDocuments[0].product_id, pictureDocuments[0].Type)
        } else {
            return this.deviceImageUrl(this.zwaveProductId, 21)
        }
    }
    async deviceInfo(): Promise<ZWaveInfo> {
        if (!this.zwaveInfo) {
            const url = `https://products.z-wavealliance.org/products/${this.zwaveProductId}/JSON`
            const resp = await axios.get<ZWaveInfo>(url)
            this.zwaveInfo = resp.data
        }
        return this.zwaveInfo
    }

    static async zwaveAllianceProductId(manufacturer: ManufacturerHex): Promise<number> {
        //TODO: update to retrieve from dynamodb
        //TODO: throw error when not found
        return 3600
    }
}