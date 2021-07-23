import { InstalledAppConfiguration, Device } from '@smartthings/core-sdk'
import { Page, Section, SmartApp, SmartAppContext } from '@smartthings/smartapp'
import { AppEvent } from '@smartthings/smartapp/lib/lifecycle-events'
import { Initialization } from '@smartthings/smartapp/lib/util/initialization'
import { difference, inRange, keys, memoize, values } from 'lodash'
import { ZWaveConfigurationCapability, ZWaveDeviceState } from './capability'
import appConfig from './config'
import { contextStoreCreator } from './contextStore'
import { AssociationGroup, CommandClass, ConfigurationParameter, ManufacturerHex, ZwaveDeviceInfo, ZWaveInfo } from './deviceInfo'



interface AppState {
    zwaveProductId: number
}

enum ParameterMultiType {
    NONE,
    BOOLEAN,
    ENUM
}


class PageManager {
    static readonly ZWAVE_DEVICE = 'selectedZwaveDevice'
    static readonly PRODUCT_ID = 'zwaveProductId'
    static readonly PARAMETER_VIRTUAL_DEVICE = 'parameterVirtual'
    async retrieveZWaveDevice(context: SmartAppContext): Promise<Device> {
        if (context.isAuthenticated()) {
            const entries = context.config[PageManager.ZWAVE_DEVICE]
            if (entries) {
                const devicesPromises = entries.map(async (entry) => {
                    if (entry.deviceConfig) {
                        return context.api.devices.get(entry.deviceConfig.deviceId)
                    }
                }).filter(v => v !== undefined)

                const devices = await Promise.all(devicesPromises)
                if (devices && devices.length && devices[0]) {
                    return devices[0]
                }

            }
            throw new Error('Device not found')
        }
        throw new Error('Context not authenticated')
    }
    async retrieveZWaveDeviceWithState(context: SmartAppContext, id?: string): Promise<ZWaveDeviceState[]> {
        if (context.isAuthenticated()) {
            if (id == undefined) {
                id = PageManager.ZWAVE_DEVICE
            }
            const devices = await context.configDevicesWithState(id)
            return devices.map(device => {
                return new ZWaveDeviceState(device)
            })
        }
        throw new Error('Context not authenticated')
    }

    private summarySection(zwaveInfo: ZWaveInfo, page: Page) {
        page.section('summaryInfo', section => {
            section.paragraphSetting('device')
                .name(zwaveInfo.Name)
                .description(zwaveInfo.Description_Short)
        })
    }
    private detailSection(zwaveInfo: ZWaveInfo, page: Page, device: ZwaveDeviceInfo) {
        page.section('detailedInfo', section => {
            section.hidden(true)
            section.hideable(true)
            section.paragraphSetting('detailName')
                .name(zwaveInfo.Name)
                .description(zwaveInfo.Description)
            section.imageSetting('deviceImage')
                .image(device.deviceImage())
                .name(zwaveInfo.Name)
                .description(zwaveInfo.Name)
        })
    }
    private commandClassSection(page: Page, sectionName: string, commandClasses: CommandClass[]) {
        if (commandClasses && commandClasses.length) {
            page.section(sectionName, (section: Section) => {
                section.hidden(true)
                section.hideable(true)
                commandClasses.forEach(commandClass => {
                    section.paragraphSetting(`${sectionName}${commandClass.Identifier}`)
                        .name(commandClass.Name)
                        .description(commandClass.Identifier)
                })
            })
        }
    }
    private commandClassesSection(zwaveInfo: ZWaveInfo, page: Page) {
        this.commandClassSection(page, 'SupportedCommandClasses', zwaveInfo.SupportedCommandClasses)
        this.commandClassSection(page, 'ControlledCommandClasses', zwaveInfo.ControlledCommandClasses)
        this.commandClassSection(page, 'S2Classes', zwaveInfo.S2Classes)
    }
    private associationGroupsSection(zwaveInfo: ZWaveInfo, page: Page, device: ZWaveDeviceState) {
        const associationGroups = zwaveInfo.AssociationGroups
        if (associationGroups && associationGroups.length) {
            page.section('AssociationGroups', section => {
                section.hidden(false)
                section.hideable(true)
                section.paragraphSetting('associationGroupInstructions')
            })
            associationGroups.forEach(associationGroup => {
                page.section(`associationGroup${associationGroup.GroupNumber}`, section => {
                    this.associationGroupSection(associationGroup, section, device)
                })
            })
        }
    }
    private configurationParametersSection(zwaveInfo: ZWaveInfo, page: Page, context: SmartAppContext, device: ZWaveDeviceState) {
        const configurationParameters = zwaveInfo.ConfigurationParameters
        if (configurationParameters && configurationParameters.length) {
            page.section('ConfigurationParameters', section => {
                section.hidden(false)
                section.hideable(true)
                section.paragraphSetting('parameterInstructions')
                section.booleanSetting(PageManager.PARAMETER_VIRTUAL_DEVICE)
            })
            if (!context.configBooleanValue(PageManager.PARAMETER_VIRTUAL_DEVICE)) {
                configurationParameters.forEach(configurationParameter => {
                    page.section(`parameter${configurationParameter.ParameterNumber}`, section => {
                        this.parameterSection(configurationParameter, section, context, device)
                    })
                })
            }
        }
    }
    private featuresSection(zwaveInfo: ZWaveInfo, page: Page) {
        const features = zwaveInfo.Features
        if (features && features.length) {
            page.section('Features', section => {
                section.hidden(true)
                section.hideable(true)
                features.forEach(feature => {
                    section.paragraphSetting(feature.feature_Id.toString())
                        .name(feature.featureName)
                        .description(feature.featureDescription)
                })
            })
        }
    }

    async zwaveProductId(installedAppId: string): Promise<number> {
        const contextStore = contextStoreCreator.createContextStore<AppState>()
        const contextRecord = await contextStore.get(installedAppId)
        const state = contextRecord.state
        if (state && state.zwaveProductId) {
            return state.zwaveProductId
        }
        throw new Error('Product Id not found')
    }

    private async parameterSection(configurationParameter: ConfigurationParameter, section: Section,
        context: SmartAppContext, device: ZWaveDeviceState): Promise<void> {

        section.name(configurationParameter.Name)

        const description = configurationParameter.Description
        const name = configurationParameter.Name
        const valueName = `parameter${configurationParameter.ParameterNumber}`


        const currentConfigurations = device.currentConfigurations
        const currentValue = currentConfigurations[configurationParameter.ParameterNumber]


        const defaultEnabled = context.configBooleanValue(`${valueName}Default`) || (context.config[`${valueName}Default`] == undefined && currentValue == configurationParameter.DefaultValue)

        if (!defaultEnabled) {
            const values = configurationParameter.ConfigurationParameterValues
            const defaultValue = currentValue != undefined ? currentValue : configurationParameter.DefaultValue
            let optionDefault = false
            const options = values
                .filter(value => value.To == value.From)
                .map(value => {
                    const defaultOption = currentValue == value.From
                    const deviceValueDesc = defaultOption ? ' *' : ''
                    optionDefault ||= defaultOption
                    return {
                        id: value.From.toString(),
                        name: `${value.DescriptionJSONSafe}${deviceValueDesc}`
                    }
                })
            const multipleValueComponents = options.length != values.length
            let multiType: ParameterMultiType = ParameterMultiType.NONE
            let multiValueDefault = false
            if (options.length == 1) {
                const option = options[0]
                const component = section.booleanSetting(`${valueName}Boolean`)
                    .name(option.name)
                    .description('Disable to specify a value')
                    .submitOnChange(true)
                    .description(description)
                    .name(name)
                if (defaultValue == Number(option.id) && context.configStringValue(`${valueName}Boolean`) == undefined) {
                    component.defaultValue('true')
                    multiValueDefault = true
                }
                multiType = ParameterMultiType.BOOLEAN
            } else if (options.length > 1) {
                const component = section.enumSetting(`${valueName}Enum`)
                    .translateOptions(false)
                    .options(options)
                    .description(description)
                    .name(name)
                    .submitOnChange(multipleValueComponents)
                    .disabled(defaultEnabled)
                if (optionDefault) {
                    multiValueDefault = true
                }
                multiType = ParameterMultiType.ENUM
            }

            if (multipleValueComponents) {
                values.filter(value => value.To != value.From)
                    .forEach(value => {
                        let component = section.numberSetting(`${valueName}Number`)
                            .min(value.From)
                            .max(value.To)
                            .step(1)
                            .description(description)
                            .name(name)
                        if (inRange(defaultValue, value.From, value.To + 1)) {
                            component = component.defaultValue(defaultValue)
                        }

                        // Disable if multiple values and the Boolean or Enum is set
                        const multipleOptions = options.length > 0
                        const booleanExistsTrue = multipleOptions
                            && multiType == ParameterMultiType.BOOLEAN
                            && (
                                context.configBooleanValue(`${valueName}Boolean`)
                                || multiValueDefault
                            )
                        const enumDefined = multipleOptions
                            && multiType == ParameterMultiType.ENUM
                            && context.configStringValue(`${valueName}Enum`) != undefined
                        const disabled =
                            booleanExistsTrue
                            || enumDefined
                        component.disabled(disabled)

                        if (disabled) {
                            const description = multiType == ParameterMultiType.BOOLEAN
                                ? 'Set to false to specify the value'
                                : 'Clear enum to specify the value'
                            section.paragraphSetting(`${valueName}Disabled`)
                                .name('Selection disabled')
                                .description(description)
                        }
                    })
            }
        } else {
            section.paragraphSetting(`${valueName}Desc`)
                .name(name)
                .description(description)
        }

        section.booleanSetting(`${valueName}Default`)
            .submitOnChange(true)
            .defaultValue(`${defaultEnabled}`)
            .name(`Reset parameter ${configurationParameter.ParameterNumber} to default`)
            .description(`Update Parameter to ${configurationParameter.DefaultValue}`)

    }

    private associationGroupName(associationGroup: AssociationGroup) {
        return associationGroup.group_name ? associationGroup.group_name : `Association Group: ${associationGroup.GroupNumber}`
    }
    private async associationGroupSection(associationGroup: AssociationGroup, section: Section, device: ZWaveDeviceState): Promise<void> {
        section.name(`Association Group ${associationGroup.GroupNumber}`)
        const lifeline = this.isLifeline(associationGroup)
        const namePrefix = `associationGroup${associationGroup.GroupNumber}`
        if (associationGroup.MaximumNodes > 1) {
            const description = lifeline ? 'Lifeline device, will attach to st hub' : ''
            section.paragraphSetting(`${namePrefix}Instructions`)
                .name(`Select up to ${associationGroup.MaximumNodes} Nodes`)
                .description(description)
            section
                .deviceSetting(`${namePrefix}Associations`)
                .name(this.associationGroupName(associationGroup))
                .description(associationGroup.Description)
                .multiple(true)
                .capability(ZWaveConfigurationCapability.CAPABILITY_ID)
                .permissions('r')
            try {
                const currentAssociations = device.associations
                const nodes = currentAssociations[`${associationGroup.GroupNumber}`]
                const description = nodes && nodes.length
                    ? nodes.join(',')
                    : 'No Associations Found'
                section.paragraphSetting(`${namePrefix}CurrentNodes`)
                    .name('Associated Nodes')
                    .description(description)

            } catch (err) {
                console.log(err)
            }
        } else {
            section
                .paragraphSetting(`${namePrefix}Info`)
                .name(this.associationGroupName(associationGroup))
                .description(associationGroup.Description)
        }

    }

    private isLifeline(associationGroup: AssociationGroup) {
        return associationGroup.Description.indexOf('Lifeline') >= 0
    }

    private missingConfig(page: Page) {
        page.section('missingConfig', section => {
            section.name(`Missing Config Data`)
            section.paragraphSetting('invaidConfigMsg').text(`Config Data not found`)
        })
    }

    private async manualSection(zwaveDevice: ZwaveDeviceInfo, page: Page) {
        const url = await zwaveDevice.productManual()
        if (url) {
            page.section('Manual', section => {
                section.linkSetting('manual')
                    .name('Device Manual')
                    .url(url)
            })
        }
    }

    private async mainPage(
        context: SmartAppContext,
        page: Page,
        configData?: InstalledAppConfiguration): Promise<void> {
        this.selectDeviceSection(page, false)
    }

    private async deviceMainPage(
        context: SmartAppContext,
        page: Page,
        configData?: InstalledAppConfiguration): Promise<void> {
        this.selectDeviceSection(page, true)
        let authContext = context
        if (configData) {
            authContext = await smartAppCreator.installedSmartAppContext(configData.installedAppId)
        }
        const devices = await this.retrieveZWaveDeviceWithState(authContext)
        const device = devices[0]
        if (configData) {
            const zwaveProductId = await this.zwaveProductId(configData.installedAppId)
            const zwDevice = new ZwaveDeviceInfo(zwaveProductId)
            const zwaveInfo = await zwDevice.deviceInfo()
            this.summarySection(zwaveInfo, page)
            this.detailSection(zwaveInfo, page, zwDevice)
            this.configurationParametersSection(zwaveInfo, page, context, device)
            this.associationGroupsSection(zwaveInfo, page, device)
            this.commandClassesSection(zwaveInfo, page)
            this.featuresSection(zwaveInfo, page)
            this.textSection(zwaveInfo, page)
            await this.manualSection(zwDevice, page)
        } else {
            this.missingConfig(page)
        }
    }

    private selectDeviceSection(page: Page, disabled: boolean) {
        page.section('zwaveDevice', section => {
            this.selectDevice(section, disabled)
        })
    }

    private selectDevice(section: Section, disabled: boolean) {
        section
            .deviceSetting(PageManager.ZWAVE_DEVICE)
            .capability(ZWaveConfigurationCapability.CAPABILITY_ID)
            .required(true)
            .multiple(false)
            .permissions(['r', 'x'])
            .disabled(disabled)
    }

    configurePages(smartApp: SmartApp): SmartApp {
        return smartApp
            .firstPageId('main')
            .page('main', this.mainPage.bind(this))
            .page('deviceMain', this.deviceMainPage.bind(this))
            .page('selectProduct', this.selectProductPage.bind(this))
    }

    toManufacturerHex(device: Device): ManufacturerHex {
        if (device.deviceManufacturerCode) {
            const manufacturerParts = device.deviceManufacturerCode.split('-')
            return {
                manufacturerId: manufacturerParts[0],
                productTypeId: manufacturerParts[1],
                productId: manufacturerParts[2]
            }
        }
        throw new Error('deviceManufacturerCode not found')
    }
    private async selectProductPage(
        context: SmartAppContext,
        page: Page,
        configData?: InstalledAppConfiguration): Promise<void> {
        const device = await this.retrieveZWaveDevice(context)
        const manufacturerHex = this.toManufacturerHex(device)
        page.section('productInfo', section => {
            this.selectDevice(section, true)
            section.paragraphSetting('productTypeId')
                .description(manufacturerHex.productTypeId)
            section.paragraphSetting('manufacturerId')
                .description(manufacturerHex.manufacturerId)
            section.paragraphSetting('productId')
                .description(manufacturerHex.productId)
        })
        page.section(PageManager.PRODUCT_ID, section => {
            section.paragraphSetting('instructions')
            section.numberSetting(PageManager.PRODUCT_ID)
                .step(1)
                .min(1)
                .max(12000)
            section.linkSetting('zwaveAllianceLink')
                .url('https://products.z-wavealliance.org/products')
        })

    }
    private textSection(zwaveInfo: ZWaveInfo, page: Page) {
        const texts = zwaveInfo.Texts
        if (texts && texts.length) {
            page.section('Texts', section => {
                section.hidden(true)
                section.hideable(true)
                texts.forEach(text => {
                    section.paragraphSetting(`text${text.Id}`)
                        .name(text.description)
                        .description(text.value)
                })
            })
        }

    }
}

interface ParameterConfig {
    parameter: number
    numberValue?: number
    enumValue?: number
    booleanValue?: boolean
    resetDefault: boolean
}

interface IndexedParameters {
    [key: number]: ParameterConfig
}

enum ParameterConfigTypes {
    Number = 'Number',
    Enum = 'Enum',
    Boolean = 'Boolean',
    Default = 'Default'
}
interface AssociationGroupConfig {
    group: number
    deviceNetworkIds: string[]
}
class SmartAppCreator {
    private readonly pageManager = new PageManager()
    private parameterRegex = /^parameter(?<parameter>\d{1,3})(?<type>Number|Enum|Boolean|Default)$/
    private associatonGroupRegex = /^associationGroup(?<associationGroup>\d{1,3})Associations$/

    async retrieveZwaveCapability(context: SmartAppContext, zwDevice: ZwaveDeviceInfo): Promise<ZWaveConfigurationCapability> {
        if (context.isAuthenticated()) {
            const configDevice = context.config[PageManager.ZWAVE_DEVICE]
            return new ZWaveConfigurationCapability(configDevice, context.api.devices, context.api.subscriptions, zwDevice)
        }
        throw new Error('Context not authenticated')
    }

    async clientConfig(): Promise<SmartApp> {
        const config = await appConfig()
        return new SmartApp({
            appId: config.appId,
            clientId: config.clientId,
            clientSecret: config.clientSecret
        })
    }

    async installHandler(context: SmartAppContext, installData: AppEvent.InstallData): Promise<void> {
        const device = await this.pageManager.retrieveZWaveDevice(context)
        if (device.deviceManufacturerCode) {
            try {
                const zwaveProductId = await ZwaveDeviceInfo.zwaveAllianceProductId(device.deviceManufacturerCode)
                await this.saveStateSupportedConfigurations(context, {
                    zwaveProductId
                }, installData.installedApp.installedAppId, true)
            } catch (err) {
                // Allow missing productId. Can update later
                console.log(err)
            }
        } else {
            throw new Error('deviceManufacturerCode not found')
        }
    }

    async updateDevice(context: SmartAppContext, zwaveProductId: number) {
        const zwDeviceInfo = new ZwaveDeviceInfo(zwaveProductId)
        const zwDevicesState = await this.pageManager.retrieveZWaveDeviceWithState(context)
        const zwDeviceState = zwDevicesState[0]
        const zwCapability = await this.retrieveZwaveCapability(context, zwDeviceInfo)
        await this.updateParameters(context, zwDeviceInfo, zwDeviceState, zwCapability)
        await this.updateAssociationGroups(context, zwDeviceInfo, zwDeviceState, zwCapability)
    }
    async updateHandler(context: SmartAppContext, updateData: AppEvent.UpdateData): Promise<void> {
        const zwaveProductId = context.configNumberValue(PageManager.PRODUCT_ID)
        if (zwaveProductId) {
            try {
                const installedProductId = await this.pageManager.zwaveProductId(updateData.installedApp.installedAppId)
                if (installedProductId != zwaveProductId) {
                    throw new Error('Product Id Mismatched')
                } else {
                    await this.updateDevice(context, zwaveProductId)
                }
            } catch (err) {
                await this.updateProductState(zwaveProductId, context, updateData.installedApp.installedAppId)
            }
        } else if (context.configBooleanValue(PageManager.PARAMETER_VIRTUAL_DEVICE)) {
            //TODO: Virtual device 
            /**
             * Capability
             * Device Profile uses capability and lists components
             * Device requires profile id
             * MISSING: How to map presentation to profile
             */
        } else {
            const installedProductId = await this.pageManager.zwaveProductId(updateData.installedApp.installedAppId)
            await this.updateDevice(context, installedProductId)
        }

    }
    private async updateAssociationGroups(context: SmartAppContext, deviceInfo: ZwaveDeviceInfo, deviceState: ZWaveDeviceState,
        deviceCapability: ZWaveConfigurationCapability) {
        const agPromises = keys(context.config).map(async key => {
            const matches = this.associatonGroupRegex.exec(key)
            if (matches && matches.groups) {
                const group = Number(matches.groups.associationGroup)
                const devices = await this.pageManager.retrieveZWaveDeviceWithState(context, key)
                return {
                    group,
                    deviceNetworkIds: devices.map(device => {
                        return device.deviceNetworkId
                    })
                } as AssociationGroupConfig
            }
        })

        const agConfigs = await Promise.all(agPromises)
        const updatePromises = agConfigs
            .filter(config => config != undefined)
            .map(async config => {
                const agConfig = <AssociationGroupConfig>config
                const currentAssociations = deviceState.associations[`${agConfig.group}`]
                await deviceCapability.updateAssociation(agConfig.group, agConfig.deviceNetworkIds, currentAssociations)
            })
        await Promise.all(updatePromises)
    }
    private async updateParameters(context: SmartAppContext, deviceInfo: ZwaveDeviceInfo, deviceState: ZWaveDeviceState,
        deviceCapability: ZWaveConfigurationCapability) {
        const parameterConfigs = keys(context.config).map(key => {
            const matches = this.parameterRegex.exec(key)
            if (matches && matches.groups) {
                const type = <ParameterConfigTypes>matches.groups.type
                const parameter = Number(matches.groups.parameter)
                const ret: ParameterConfig = {
                    parameter,
                    resetDefault: type == ParameterConfigTypes.Default && context.configBooleanValue(key),
                    booleanValue: type == ParameterConfigTypes.Boolean && context.configBooleanValue(key),
                    numberValue: type == ParameterConfigTypes.Number
                        ? context.configNumberValue(key)
                        : undefined,
                    enumValue: type == ParameterConfigTypes.Enum
                        ? context.configNumberValue(key)
                        : undefined
                }
                return ret
            }
        })
            .filter(keyVal => keyVal != undefined)
            .reduce((prev, curr) => {
                if (curr) {
                    let par = prev[curr.parameter]
                    if (!par) {
                        prev[curr.parameter] = curr
                    } else {
                        par.resetDefault ||= curr.resetDefault
                        par.numberValue ||= curr.numberValue
                        par.enumValue ||= curr.enumValue
                        par.booleanValue ||= curr.booleanValue
                    }
                }
                return prev
            }, {} as IndexedParameters)

        const updates = values(parameterConfigs).map(async (parameterConfig) => {
            if (parameterConfig) {
                if (parameterConfig.resetDefault || parameterConfig.numberValue || parameterConfig.enumValue || parameterConfig.booleanValue) {
                    try {
                        const config = await deviceInfo.configurationParameter(parameterConfig.parameter)
                        let value = parameterConfig.enumValue || parameterConfig.numberValue
                        if (parameterConfig.booleanValue) {
                            value = config.ConfigurationParameterValues
                                .filter(config => config.From == config.To)[0].From
                        } else if (parameterConfig.resetDefault) {
                            value = config.DefaultValue
                        }
                        const currentConfigs = deviceState.currentConfigurations
                        const currentValue = currentConfigs[parameterConfig.parameter]
                        if (currentValue != value) {
                            await deviceCapability.updateConfiguration(parameterConfig.parameter,
                                parameterConfig.resetDefault, value, config.Size)
                        }

                    } catch (err) {
                        console.log(err)
                    }
                }
            }
        })
        await Promise.all(updates)
    }

    private async updateProductState(zwaveProductId: number, context: SmartAppContext, installedAppId: string) {
        const zwDeviceInfo = new ZwaveDeviceInfo(zwaveProductId)
        const zwDeviceManufacturerCode = await zwDeviceInfo.deviceManufacturerCode()
        const device = await this.pageManager.retrieveZWaveDevice(context)
        if (device.deviceManufacturerCode == zwDeviceManufacturerCode) {
            await zwDeviceInfo.saveProductIdMap()
            await this.saveStateSupportedConfigurations(context, {
                zwaveProductId
            }, installedAppId, false)
        } else {
            throw new Error('Device does not match zWaveProduct')
        }
    }

    async saveStateSupportedConfigurations(context: SmartAppContext, state: AppState, installedAppId: string, putState: boolean) {
        await this.saveState(state, installedAppId, putState)
        const zwCapability = await this.retrieveZwaveCapability(context, new ZwaveDeviceInfo(state.zwaveProductId))
        await zwCapability.supportedConfigurations()
    }

    async saveState(state: AppState, installedAppId: string, putState: boolean) {
        const contextStore = contextStoreCreator.createContextStore()
        if (putState) {
            await contextStore.put({
                installedAppId,
                state,
                authToken: '',
                refreshToken: ''
            })
        } else {
            await contextStore.update(installedAppId, {
                state
            })
        }

    }
    private async initialized(context: SmartAppContext, initialization: Initialization, configData: AppEvent.ConfigurationData): Promise<void> {
        if (configData.config[PageManager.ZWAVE_DEVICE]) {
            try {
                const productId = await this.pageManager.zwaveProductId(configData.installedAppId)
                initialization.firstPageId("deviceMain")
            } catch (err) {
                initialization.firstPageId("selectProduct")
            }
        }
    }
    private async _createSmartApp(): Promise<SmartApp> {
        const smartApp = await this.clientConfig()
        return this.pageManager.configurePages(smartApp)
            .contextStore(contextStoreCreator.createContextStore())
            .enableEventLogging()
            .configureI18n()
            .installed(this.installHandler.bind(this))
            .initialized(this.initialized.bind(this))
            .updated(this.updateHandler.bind(this))
    }

    async installedSmartAppContext(installedAppId: string): Promise<SmartAppContext> {
        const smartApp = await this.clientConfig()
        const ret = await smartApp
            .contextStore(contextStoreCreator.createContextStore())
            .withContext(installedAppId)
        return ret
    }

    createSmartApp = memoize(this._createSmartApp)
}

export const smartAppCreator = new SmartAppCreator()