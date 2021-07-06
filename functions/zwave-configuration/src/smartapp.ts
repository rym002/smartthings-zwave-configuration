import { InstalledAppConfiguration } from '@smartthings/core-sdk'
import { Page, Section, SmartApp, SmartAppContext } from '@smartthings/smartapp'
import { AppEvent } from '@smartthings/smartapp/lib/lifecycle-events'
import { Initialization } from '@smartthings/smartapp/lib/util/initialization'
import { groupBy, inRange, keys, values } from 'lodash'
import { Manufacturer, ZWaveConfigurationCapability, ZWaveDeviceState } from './capability'
import appConfig from './config'
import { contextStoreCreator } from './contextStore'
import { AssociationGroup, CommandClass, ConfigurationParameter, ZwaveDevice, ZWaveInfo } from './deviceInfo'
import { memoize } from 'lodash'


const ZWAVE_DEVICE = 'selectedZwaveDevice'
const PRODUCT_ID = 'zwaveProductId'

interface AppState {
    zwaveProductId: number
}
interface SmartAppContextWithInstalledId extends SmartAppContext {
    installedAppId: string
}
async function retrieveZWaveDeviceWithState(context: SmartAppContext): Promise<ZWaveDeviceState> {
    if (context.isAuthenticated()) {
        const devices = await context.configDevicesWithState(ZWAVE_DEVICE)
        if (devices && devices.length) {
            return new ZWaveDeviceState(devices[0])
        }
        throw new Error('Device not found')
    }
    throw new Error('Context not authenticated')
}

async function retrieveZwaveCapability(context: SmartAppContext, zwDevice: ZwaveDevice): Promise<ZWaveConfigurationCapability> {
    if (context.isAuthenticated()) {
        const configDevice = context.config[ZWAVE_DEVICE]
        return new ZWaveConfigurationCapability(configDevice, context.api.devices, context.api.subscriptions, zwDevice)
    }
    throw new Error('Context not authenticated')
}

class PageManager {

    private summarySection(zwaveInfo: ZWaveInfo, page: Page) {
        page.section('summaryInfo', section => {
            section.paragraphSetting('device')
                .name(zwaveInfo.Name)
                .description(zwaveInfo.Description_Short)
        })
    }
    private detailSection(zwaveInfo: ZWaveInfo, page: Page, device: ZwaveDevice) {
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
    private associationGroupsSection(zwaveInfo: ZWaveInfo, page: Page) {
        const associationGroups = zwaveInfo.AssociationGroups
        if (associationGroups && associationGroups.length) {
            page.section('AssociationGroups', section => {
                section.hidden(false)
                section.hideable(true)
                associationGroups.forEach(associationGroup => {
                    const pageName = this.associationGroupPageName(associationGroup.GroupNumber)
                    section.paragraphSetting(`${pageName}Info`)
                        .name(`Association Group ${associationGroup.GroupNumber}`)
                        .description(associationGroup.Description)
                    if (associationGroup.MaximumNodes > 1) {
                        section.pageSetting(`${pageName}Configure`)
                            .page(pageName)
                            .name(`Configure Association Group ${associationGroup.GroupNumber}`)
                            .description('')

                    }
                })
            })
        }
    }
    private configurationParametersSection(zwaveInfo: ZWaveInfo, page: Page) {
        const configurationParameters = zwaveInfo.ConfigurationParameters
        if (configurationParameters && configurationParameters.length) {
            page.section('ConfigurationParameters', section => {
                section.hidden(false)
                section.hideable(true)
                section.paragraphSetting('parameterInstructions')
                configurationParameters.forEach(configurationParameter => {
                    const pageName = this.parameterPageName(configurationParameter.ParameterNumber)
                    section.pageSetting(pageName)
                        .page(pageName)
                        .name(configurationParameter.Name)
                        .description(configurationParameter.Description)
                })
            })
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
    private async parameterSection(configurationParameter: ConfigurationParameter, page: Page,
        context: SmartAppContext, configData?: InstalledAppConfiguration): Promise<void> {

        let authContext = context
        if (configData) {
            authContext = await smartAppCreator.installedSmartAppContext(configData.installedAppId)
        }
        const device = await retrieveZWaveDeviceWithState(authContext)
        page.section('parameter', section => {
            page.name("Configuration")
            section.name(`Configure Parameter ${configurationParameter.ParameterNumber}`)

            const description = configurationParameter.Description
            const name = configurationParameter.Name
            const valueName = `parameter${configurationParameter.ParameterNumber}`

            section.booleanSetting(`${valueName}Virtual`)
                .name('Virtual Device')
                .description('Create a virtual device to use in automations')

            const values = configurationParameter.ConfigurationParameterValues
            const currentConfigurations = device.getCurrentConfigurations()
            const currentValue = currentConfigurations[configurationParameter.ParameterNumber]
            const defaultValue = currentValue != undefined ? currentValue : configurationParameter.DefaultValue


            if (context.configBooleanValue(`${valueName}Virtual`)) {
                section.paragraphSetting(valueName)
                    .name(name)
                    .description(description)
                section.paragraphSetting('parameterVirtualEnabled')
                    .name('Use the virtual device to configure')
                    .description('')
            } else {
                const defaultEnabled = context.configBooleanValue(`${valueName}Default`)
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

                if (options.length == 1) {
                    const option = options[0]
                    const component = section.booleanSetting(`${valueName}Boolean`)
                        .name(option.name)
                        .description('Disable to specify a value')
                        .submitOnChange(true)
                        .description(description)
                        .name(name)
                        .disabled(defaultEnabled)
                    if (defaultValue == Number(option.id)) {
                        component.defaultValue('true')
                    }

                } else if (options.length > 1) {
                    const component = section.enumSetting(`${valueName}Enum`)
                        .translateOptions(false)
                        .options(options)
                        .description(description)
                        .name(name)
                        .submitOnChange(multipleValueComponents)
                        .disabled(defaultEnabled)
                    if (optionDefault) {
                        component.defaultValue(defaultValue)
                    }
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
                            const disabled = !(
                                options.length == 0 ||
                                (options.length > 0
                                    && (context.configBooleanValue(`${valueName}Boolean`)
                                        || context.configStringValue(`${valueName}Enum`)
                                    )
                                )
                            )
                            component.disabled(disabled || defaultEnabled)

                            if (disabled) {
                                section.paragraphSetting('disabledParameter')
                                    .name('Selection disabled')
                                    .description('Set to false to specify')
                            }
                        })
                }

                section.booleanSetting(`${valueName}Default`)
                    .submitOnChange(true)
                    .name('Reset to default')
                    .description(`Update to ${configurationParameter.DefaultValue}`)
                    .disabled(currentValue == configurationParameter.DefaultValue)
            }
        })

    }
    private async associationGroupSection(associationGroup: AssociationGroup, page: Page): Promise<void> {
        //TODO: association group handling
        page.section('associationGroup', section => {
            page.name("Association Group Configuration")
            section.name(`Association Group ${associationGroup.GroupNumber}`)
            section.paragraphSetting('name')
                .name(associationGroup.group_name)
                .description(associationGroup.Description)
            //TODO: show currently associated devices
            //TODO: show device config?
        })

    }
    private configurationPage(parameterNumber: number) {
        return async (
            context: SmartAppContext,
            page: Page,
            configData?: InstalledAppConfiguration): Promise<void> => {
            if (configData) {
                try {
                    const zwaveProductId = await this.zwaveProductId(configData.installedAppId)
                    const zwDevice = new ZwaveDevice(zwaveProductId)
                    const zwInfo = await zwDevice.deviceInfo()
                    const parameters = zwInfo.ConfigurationParameters.filter(configurationParameter => {
                        return configurationParameter.ParameterNumber == parameterNumber
                    })

                    if (parameters && parameters.length) {
                        const parameter = parameters[0]
                        await this.parameterSection(parameter, page, context, configData)
                    } else {
                        page.section('invalidParameter', section => {
                            section.name(`Invalid Parameter`)
                            section.paragraphSetting('invaidParameterMsg').text(`Parameter ${parameterNumber} not found for device`)
                        })
                    }
                } catch (err) {
                    this.missingProductSection(page, err)
                }
            } else {
                this.missingConfig(page)
            }
            page.previousPageId('deviceMain')
        }
    }
    private missingConfig(page: Page) {
        page.section('missingConfig', section => {
            section.name(`Missing Config Data`)
            section.paragraphSetting('invaidConfigMsg').text(`Config Data not found`)
        })
    }

    private associationGroupPage(groupNumber: number) {
        return async (
            context: SmartAppContext,
            page: Page,
            configData?: InstalledAppConfiguration): Promise<void> => {
            if (configData) {
                try {
                    const zwaveProductId = await this.zwaveProductId(configData.installedAppId)
                    const zwDevice = new ZwaveDevice(zwaveProductId)
                    const zwInfo = await zwDevice.deviceInfo()
                    const associationGroups = zwInfo.AssociationGroups.filter(associationGroup => {
                        return associationGroup.GroupNumber == groupNumber
                    })

                    if (associationGroups) {
                        const associationGroup = associationGroups[0]
                        await this.associationGroupSection(associationGroup, page)
                    } else {
                        page.section('invalidAssociationGroup', section => {
                            section.name(`Invalid Assocition Group`)
                            section.paragraphSetting('invaidAssociationGroupMsg').text(`Association Group ${groupNumber} not found for device`)
                        })
                    }
                } catch (err) {
                    this.missingProductSection(page, err)
                }
            } else {
                this.missingConfig(page)
            }
            page.previousPageId('main')
        }
    }
    private async manualSection(zwaveDevice: ZwaveDevice, page: Page) {
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
        if (configData) {
            const zwaveProductId = await this.zwaveProductId(configData.installedAppId)
            const zwDevice = new ZwaveDevice(zwaveProductId)
            const zwaveInfo = await zwDevice.deviceInfo()
            this.summarySection(zwaveInfo, page)
            this.detailSection(zwaveInfo, page, zwDevice)
            this.configurationParametersSection(zwaveInfo, page)
            this.associationGroupsSection(zwaveInfo, page)
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
            .deviceSetting(ZWAVE_DEVICE)
            .capability(ZWaveConfigurationCapability.CAPABILITY_ID)
            .required(true)
            .multiple(false)
            .permissions(['r', 'x'])
            .disabled(disabled)
    }
    private missingProductSection(page: Page, err: Error) {
        console.log(err)
        page.section('missingProduct', section => {
            section.name('Missing Product')
            section.paragraphSetting('productError')
                .name('Error')
                .description(err.message)
        })
    }

    configurePages(smartApp: SmartApp): SmartApp {
        smartApp = this.configurationpageManager(smartApp)
        return this.associationGrouppageManager(smartApp)
            .firstPageId('main')
            .page('main', this.mainPage.bind(this))
            .page('deviceMain', this.deviceMainPage.bind(this))
            .page('selectProduct', this.selectProductPage.bind(this))
    }
    private associationGroupPageName(parameter: number): string {
        return `associationGroup${parameter}`
    }
    private parameterPageName(parameter: number): string {
        return `parameter${parameter}`
    }
    private configurationpageManager(smartApp: SmartApp): SmartApp {
        for (let parameterNumber = 1; parameterNumber <= 255; parameterNumber++) {
            smartApp = smartApp.page(this.parameterPageName(parameterNumber), this.configurationPage(parameterNumber).bind(this))
        }
        return smartApp
    }
    private associationGrouppageManager(smartApp: SmartApp): SmartApp {
        for (let groupId = 1; groupId <= 255; groupId++) {
            smartApp = smartApp.page(this.associationGroupPageName(groupId), this.associationGroupPage(groupId).bind(this))
        }
        return smartApp
    }

    private async selectProductPage(
        context: SmartAppContext,
        page: Page,
        configData?: InstalledAppConfiguration): Promise<void> {
        const zwaveDevice = await retrieveZWaveDeviceWithState(context)
        const manufacturer = zwaveDevice.getManufacturerInfo()
        const manufacturerHex = ZWaveConfigurationCapability.toManufacturerHex(manufacturer)
        page.section('productInfo', section => {
            this.selectDevice(section, true)
            section.paragraphSetting('productTypeId')
                .description(manufacturerHex.productTypeId)
            section.paragraphSetting('manufacturerId')
                .description(manufacturerHex.manufacturerId)
            section.paragraphSetting('productId')
                .description(manufacturerHex.productId)
        })
        page.section(PRODUCT_ID, section => {
            section.paragraphSetting('instructions')
            section.numberSetting(PRODUCT_ID)
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
    virtualDevice: boolean
    resetDefault: boolean
}

interface IndexedParameters {
    [key: number]: ParameterConfig
}

enum ParameterConfigTypes {
    Number = 'Number',
    Enum = 'Enum',
    Boolean = 'Boolean',
    Virtual = 'Virtual',
    Default = 'Default'
}
class SmartAppCreator {
    private readonly pageManager = new PageManager()
    private parameterRegex = /^parameter(?<parameter>\d{1,3})(?<type>Number|Enum|Boolean|Virtual|Default)$/
    async clientConfig(): Promise<SmartApp> {
        const config = await appConfig()
        return new SmartApp({
            appId: config.appId,
            clientId: config.clientId,
            clientSecret: config.clientSecret
        })
    }

    async installHandler(context: SmartAppContext, installData: AppEvent.InstallData): Promise<void> {
        const deviceCapabilty = await retrieveZwaveCapability(context, new ZwaveDevice(-1))
        const manuSub = await context.api.subscriptions.subscribeToDevices(deviceCapabilty.deviceConfigEntry,
            ZWaveConfigurationCapability.CAPABILITY_ID,
            'manufacturer', 'manufacturerEvent')
        const status = await deviceCapabilty.refreshManufacturer()
    }

    async updateHandler(context: SmartAppContext, updateData: AppEvent.UpdateData): Promise<void> {
        const zwaveProductId = context.configNumberValue(PRODUCT_ID)
        if (zwaveProductId) {
            await this.updateProductState(zwaveProductId, context, updateData.installedApp.installedAppId)
        } else {
            const zwaveProductId = await this.pageManager.zwaveProductId(updateData.installedApp.installedAppId)
            const zwDevice = new ZwaveDevice(zwaveProductId)
            await this.updateParameters(context, zwDevice)
        }
    }

    private async updateParameters(context: SmartAppContext, zwDevice: ZwaveDevice) {
        const parameterConfigs = keys(context.config).map(key => {
            const matches = this.parameterRegex.exec(key)
            if (matches && matches.groups) {
                const type = <ParameterConfigTypes>matches.groups.type
                const parameter = Number(matches.groups.parameter)
                const ret: ParameterConfig = {
                    parameter,
                    resetDefault: type == ParameterConfigTypes.Default && context.configBooleanValue(key),
                    virtualDevice: type == ParameterConfigTypes.Virtual && context.configBooleanValue(key),
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
                        par.virtualDevice ||= curr.virtualDevice
                        par.numberValue ||= curr.numberValue
                        par.enumValue ||= curr.enumValue
                        par.booleanValue ||= curr.booleanValue
                    }
                }
                return prev
            }, {} as IndexedParameters)

        const updates = values(parameterConfigs).map(async (parameterConfig) => {
            if (parameterConfig) {
                if (parameterConfig.virtualDevice) {
                    //TODO: Create default device
                } else if (parameterConfig.resetDefault || parameterConfig.numberValue || parameterConfig.enumValue || parameterConfig.booleanValue) {
                    try {
                        const config = await zwDevice.configurationParameter(parameterConfig.parameter)
                        let value = parameterConfig.enumValue || parameterConfig.numberValue
                        if (parameterConfig.booleanValue) {
                            value = config.ConfigurationParameterValues
                                .filter(config => config.From == config.To)[0].From
                        } else if (parameterConfig.resetDefault) {
                            value = config.DefaultValue
                        }
                        const zwaveDevice = await retrieveZWaveDeviceWithState(context)
                        const currentConfigs = zwaveDevice.getCurrentConfigurations()
                        const currentValue = currentConfigs[parameterConfig.parameter]
                        if (currentValue != value) {
                            const zwCapability = await retrieveZwaveCapability(context, zwDevice)
                            await zwCapability.updateConfiguration(parameterConfig.parameter, parameterConfig.resetDefault, value, config.Size)
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
        const zwDevice = new ZwaveDevice(zwaveProductId)
        const deviceInfo = await zwDevice.deviceInfo()
        const zwaveDevice = await retrieveZWaveDeviceWithState(context)
        const manufacturer = zwaveDevice.getManufacturerInfo()
        const manufacturerHex = ZWaveConfigurationCapability.toManufacturerHex(manufacturer)
        if (deviceInfo.ProductId == manufacturerHex.productId
            && deviceInfo.ManufacturerId == manufacturerHex.manufacturerId
            && deviceInfo.ProductTypeId == manufacturerHex.productTypeId) {
            await zwDevice.saveProductIdMap()
            await this.saveStateSupportedConfigurations(context, {
                zwaveProductId
            }, installedAppId)
        } else {
            throw new Error('Device does not match zWaveProduct')
        }
    }

    async saveStateSupportedConfigurations(context: SmartAppContext, state: AppState, installedAppId: string) {
        await this.saveState(state, installedAppId)
        const zwCapability = await retrieveZwaveCapability(context, new ZwaveDevice(state.zwaveProductId))
        await zwCapability.supportedConfigurations()
    }

    async saveState(state: AppState, installedAppId: string) {
        const contextStore = contextStoreCreator.createContextStore()
        await contextStore.update(installedAppId, {
            state
        })

    }
    private installIdFromContext(context: SmartAppContext): string {
        const contextWId = <SmartAppContextWithInstalledId>context
        return contextWId.installedAppId
    }
    async manufacturerEventHandler(
        context: SmartAppContext,
        eventData: AppEvent.DeviceEvent,
        eventTime: string) {
        const manufacturer = <Manufacturer>eventData.value
        const manufacturerHex = ZWaveConfigurationCapability.toManufacturerHex(manufacturer)
        try {
            const zwaveProductId = await ZwaveDevice.zwaveAllianceProductId(manufacturerHex)
            const installedAppId = this.installIdFromContext(context)
            await this.saveStateSupportedConfigurations(context, {
                zwaveProductId
            }, installedAppId)
        } catch (err) {
            console.log('Error ', err)
        }

    }
    private async initialized(context: SmartAppContext, initialization: Initialization, configData: AppEvent.ConfigurationData): Promise<void> {
        if (configData.config[ZWAVE_DEVICE]) {
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
            .subscribedEventHandler('manufacturerEvent', this.manufacturerEventHandler.bind(this))
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

//TODO: Device auto create
/**
 * Capability
 * Device Profile uses capability and lists components
 * Device requires profile id
 * MISSING: How to map presentation to profile
 */