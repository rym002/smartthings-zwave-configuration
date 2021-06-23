import { SmartApp, SmartAppContext, Page, Section, ContextStore, ContextRecord } from '@smartthings/smartapp'
import { InstalledAppConfiguration, ConfigValueType } from '@smartthings/core-sdk'
import appConfig from './config'
import { AssociationGroup, CommandClass, ConfigurationParameter, ZwaveDevice, ZWaveInfo } from './deviceInfo'
import { Manufacturer, ZWaveConfigurationCapability, ZWaveDeviceState } from './capability'
import { AppEvent } from '@smartthings/smartapp/lib/lifecycle-events'
import { contextStoreCreator } from './contextStore'
const ZWAVE_DEVICE = 'selectedZwaveDevice'

interface AppState {
    zwaveProductId: number
}
interface SmartAppContextWithInstalledId extends SmartAppContext {
    installedAppId: string
}
async function retrieveZWaveDeviceWithState(context: SmartAppContext): Promise<ZWaveDeviceState> {
    if (context.isAuthenticated()) {
        const devices = await context.configDevicesWithState(ZWAVE_DEVICE)
        return new ZWaveDeviceState(devices[0])
    }
    throw new Error('Context not authenticated')
}

async function retrieveZwaveCapability(context: SmartAppContext): Promise<ZWaveConfigurationCapability> {
    if (context.isAuthenticated()) {
        const configDevice = context.config[ZWAVE_DEVICE]
        return new ZWaveConfigurationCapability(configDevice, context.api.devices, context.api.subscriptions)
    }
    throw new Error('Context not authenticated')
}

class Pages {

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
                section.hidden(true)
                section.hideable(true)
                associationGroups.forEach(associationGroup => {
                    const pageName = this.associationGroupPageName(associationGroup.GroupNumber)
                    section.pageSetting(pageName)
                        .page(pageName)
                        .name(`Association Group ${associationGroup.GroupNumber}`)
                        .description(associationGroup.Description)
                })
            })
        }
    }
    private configurationParametersSection(zwaveInfo: ZWaveInfo, page: Page) {
        const configurationParameters = zwaveInfo.ConfigurationParameters
        if (configurationParameters && configurationParameters.length) {
            page.section('ConfigurationParameters', section => {
                section.hidden(true)
                section.hideable(true)
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
    private async zwaveProductId(installedAppId: string): Promise<number> {
        const contextStore = contextStoreCreator.createContextStore<AppState>()
        const contextRecord = await contextStore.get(installedAppId)
        const state = contextRecord.state
        if (state) {
            return state.zwaveProductId
        }
        throw new Error('Product Id not found')
    }
    private async parameterSection(configurationParameter: ConfigurationParameter, page: Page): Promise<void> {
        //TODO: parameter handling
        page.section('parameter', section => {
            section.name(`Configuration Parameter ${configurationParameter.ParameterNumber}`)
            section.paragraphSetting('name')
                .name(configurationParameter.Name)
                .description(configurationParameter.Description)
        })

    }
    private async associationGroupSection(associationGroup: AssociationGroup, page: Page): Promise<void> {
        //TODO: association group handling
        page.section('associationGroup', section => {
            section.name(`Association Group ${associationGroup.GroupNumber}`)
            section.paragraphSetting('name')
                .name(associationGroup.group_name)
                .description(associationGroup.Description)
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

                    if (parameters) {
                        const parameter = parameters[0]
                        await this.parameterSection(parameter, page)
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
            page.previousPageId('main')
            page.complete(true)
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
            page.complete(true)
        }
    }
    private async mainPage(
        context: SmartAppContext,
        page: Page,
        configData?: InstalledAppConfiguration): Promise<void> {
        if (configData) {
            if (context.isAuthenticated()) {
                try {
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
                } catch (err) {
                    this.missingProductSection(page, err)
                }
            } else {
                this.selectDevicePage(page)
            }
        } else {
            this.selectDevicePage(page)
        }
        page.complete(true)
    }

    private selectDevicePage(page: Page) {
        page.section('zwaveDevice', section => {
            section
                .deviceSetting(ZWAVE_DEVICE)
                .capability(ZWaveConfigurationCapability.CAPABILITY_ID)
                .required(true)
                .multiple(false)
                .permissions(['r', 'x'])
        })
    }

    private missingProductSection(page: Page, err: Error) {
        page.section('missingProduct', section => {
            section.name('Missing Product')
            section.paragraphSetting('productError')
                .name('Error')
                .description(err.message)
        })
    }

    configurePages(smartApp: SmartApp): SmartApp {
        smartApp = this.configurationPages(smartApp)
        return this.associationGroupPages(smartApp)
            .firstPageId('main')
            .page('main', this.mainPage.bind(this))

    }
    private associationGroupPageName(parameter: number): string {
        return `associationGroup${parameter}`
    }
    private parameterPageName(parameter: number): string {
        return `parameter${parameter}`
    }
    private configurationPages(smartApp: SmartApp): SmartApp {
        for (let parameterNumber = 1; parameterNumber <= 255; parameterNumber++) {
            smartApp = smartApp.page(this.parameterPageName(parameterNumber), this.configurationPage(parameterNumber).bind(this))
        }
        return smartApp
    }
    private associationGroupPages(smartApp: SmartApp): SmartApp {
        for (let groupId = 1; groupId <= 255; groupId++) {
            smartApp = smartApp.page(this.associationGroupPageName(groupId), this.associationGroupPage(groupId).bind(this))
        }
        return smartApp
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

class SmartAppCreator {
    private readonly pages = new Pages()
    private smartApp: SmartApp | undefined

    async clientConfig(): Promise<SmartApp> {
        const config = await appConfig()
        return new SmartApp({
            appId: config.appId,
            clientId: config.clientId,
            clientSecret: config.clientSecret
        })
    }

    async updatedHandler(context: SmartAppContext, installData: AppEvent.InstallData): Promise<void> {
        const deviceCapabilty = await retrieveZwaveCapability(context)
        const deleteRet = await context.api.subscriptions.delete()
        const manuSub = await context.api.subscriptions.subscribeToDevices(deviceCapabilty.deviceConfigEntry,
            ZWaveConfigurationCapability.CAPABILITY_ID,
            'manufacturer', 'manufacturerEvent')
        const status = await deviceCapabilty.refreshManufacturer()
    }

    async manufacturerEventHandler(
        context: SmartAppContext,
        eventData: AppEvent.DeviceEvent,
        eventTime: string) {
        const manufacturer = <Manufacturer>eventData.value
        const manufacturerHex = ZWaveConfigurationCapability.toManufacturerHex(manufacturer)
        try {
            const zwaveProductId = await ZwaveDevice.zwaveAllianceProductId(manufacturerHex)
            const state: AppState = {
                zwaveProductId
            }
            const contextStore = contextStoreCreator.createContextStore()
            const contextWId = <SmartAppContextWithInstalledId>context
            const installedAppId = contextWId.installedAppId
            contextStore.update(installedAppId, {
                state
            })
        } catch (err) {
            console.log('Error %j', err)
        }

    }
    async createSmartApp(): Promise<SmartApp> {
        if (!this.smartApp) {
            const smartApp = await this.clientConfig()
            this.smartApp = this.pages.configurePages(smartApp)
                .contextStore(contextStoreCreator.createContextStore())
                .enableEventLogging()
                .configureI18n()
                .updated(this.updatedHandler.bind(this))
                .installed(this.updatedHandler.bind(this))
                .subscribedEventHandler('manufacturerEvent', this.manufacturerEventHandler.bind(this))
        }
        return this.smartApp
    }

    async installedSmartAppContext(installedAppId: string): Promise<SmartAppContext> {
        const smartApp = await this.clientConfig()
        const ret = await smartApp
            .contextStore(contextStoreCreator.createContextStore())
            .withContext(installedAppId)
        return ret
    }
}

export const smartAppCreator = new SmartAppCreator()
