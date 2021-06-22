import { SmartApp, SmartAppContext, Page, Section } from '@smartthings/smartapp'
import { InstalledAppConfiguration, ConfigValueType } from '@smartthings/core-sdk'
import appConfig from './config'
import { AssociationGroup, CommandClass, ConfigurationParameter, ZwaveDevice, ZWaveInfo } from './deviceInfo'
import { Manufacturer, ZWaveConfigurationCapability, ZWaveDeviceState } from './capability'
import { AppEvent } from '@smartthings/smartapp/lib/lifecycle-events'

const DynamoDBContextStore = require('@smartthings/dynamodb-context-store')
const ZWAVE_DEVICE = 'selectedZwaveDevice'

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
    static ZWAVE_PRODUCT_ID = "zwaveProductId"

    private summarySection(zwaveInfo: ZWaveInfo, page: Page) {
        page.section('summaryInfo', section => {
            section.paragraphSetting('name')
                .name(zwaveInfo.Name)
                .description(zwaveInfo.Description)
        })
    }
    private commandClassSection(page: Page, sectionName: string, commandClasses: CommandClass[]) {
        if (commandClasses.length) {
            page.section(sectionName, (section: Section) => {
                section.hidden(true)
                commandClasses.forEach(commandClass => {
                    section.paragraphSetting(commandClass.Identifier)
                        .name(commandClass.Identifier)
                        .description(commandClass.Name)
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
        page.section('AssociationGroups', section => {
            section.hidden(true)
            zwaveInfo.AssociationGroups.forEach(associationGroup => {
                const pageName = this.asscoiationGroupPageName(associationGroup.GroupNumber)
                section.pageSetting(associationGroup.GroupNumber.toString())
                    .page(pageName)
                    .name(associationGroup.group_name)
                    .description(associationGroup.Description)
            })
        })
    }
    private configurationParametersSection(zwaveInfo: ZWaveInfo, page: Page) {
        page.section('ConfigurationParameters', section => {
            section.hidden(true)
            zwaveInfo.ConfigurationParameters.forEach(configurationParameter => {
                const pageName = this.parameterPageName(configurationParameter.ParameterNumber)
                section.pageSetting(pageName)
                    .page(pageName)
                    .name(configurationParameter.Name)
                    .description(configurationParameter.Description)
            })
        })
    }
    private featuresSection(zwaveInfo: ZWaveInfo, page: Page) {
        page.section('Features', section => {
            section.hidden(true)
            zwaveInfo.Features.forEach(feature => {
                section.paragraphSetting(feature.feature_Id.toString())
                    .name(feature.featureName)
                    .description(feature.featureDescription)
            })
        })
    }
    private zwaveProductIdFromConfig(configMap: AppEvent.ConfigMap): number {
        const config = configMap[Pages.ZWAVE_PRODUCT_ID]
        if (config && config[0].stringConfig) {
            return Number(config[0].stringConfig.value)
        }
        throw new Error('Product Id not found')
    }
    private async parameterSection(configurationParameter: ConfigurationParameter, page: Page): Promise<void> {
        //TODO: parameter handling
        page.section('parameter', section => {
            section.paragraphSetting('name')
                .name(configurationParameter.Name)
                .description(configurationParameter.Description)
        })

    }
    private async associationGroupSection(associationGroup: AssociationGroup, page: Page): Promise<void> {
        //TODO: association group handling
        page.section('associationGroup', section => {
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
            try {
                const zwaveProductId = this.zwaveProductIdFromConfig(context.config)
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
                        section.paragraphSetting('invaidParameterMsg').text(`Parameter ${parameterNumber} not found for device `)
                    })
                }
            } catch (err) {
                this.missingProductSection(page, err)
            }
            page.previousPageId('main')
            page.complete(true)
        }
    }
    private associationGroupPage(groupNumber: number) {
        return async (
            context: SmartAppContext,
            page: Page,
            configData?: InstalledAppConfiguration): Promise<void> => {
            try {
                const zwaveProductId = this.zwaveProductIdFromConfig(context.config)
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
            page.previousPageId('main')
            page.complete(true)
        }
    }
    private async mainPage(
        context: SmartAppContext,
        page: Page,
        configData?: InstalledAppConfiguration): Promise<void> {
        if (configData) {
            const installedContext = await smartAppCreator.installedSmartAppContext(configData.installedAppId)
            if (installedContext.isAuthenticated()) {
                try {
                    const zwaveProductId = this.zwaveProductIdFromConfig(installedContext.config)
                    const zwDevice = new ZwaveDevice(zwaveProductId)
                    const zwaveInfo = await zwDevice.deviceInfo()
                    this.associationGroupsSection(zwaveInfo, page)
                    this.configurationParametersSection(zwaveInfo, page)
                    this.summarySection(zwaveInfo, page)
                    this.commandClassesSection(zwaveInfo, page)
                    this.featuresSection(zwaveInfo, page)
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
    private asscoiationGroupPageName(parameter: number): string {
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
            smartApp = smartApp.page(this.asscoiationGroupPageName(groupId), this.associationGroupPage(groupId).bind(this))
        }
        return smartApp
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

    contextStore(): any {
        return new DynamoDBContextStore({
            autoCreate: false,
            AWSRegion: process.env.AWS_REGION,
            table: {
                name: process.env.context_store_table
            }
        })
    }
    async updatedHandler(context: SmartAppContext, installData: AppEvent.InstallData): Promise<void> {
        const deviceCapabilty = await retrieveZwaveCapability(context)
        const deleteRet = await context.api.subscriptions.delete()
        const manuSub = await context.api.subscriptions.subscribeToDevices(deviceCapabilty.deviceConfigEntry,
            ZWaveConfigurationCapability.CAPABILITY_ID,
            'manufacturer', 'manufacturerEvent')
        const status = await deviceCapabilty.refreshManufacturer()

        console.log(status)
    }

    async manufacturerEventHandler(
        context: SmartAppContext,
        eventData: AppEvent.DeviceEvent,
        eventTime: string) {
        const manufacturer = <Manufacturer>eventData.data
        const manufacturerHex = ZWaveConfigurationCapability.toManufacturerHex(manufacturer)
        try {
            const zwaveProductId = await ZwaveDevice.zwaveAllianceProductId(manufacturerHex)
            context.config[Pages.ZWAVE_PRODUCT_ID] = [
                {
                    valueType: ConfigValueType.STRING,
                    stringConfig: {
                        value: zwaveProductId.toString()
                    }
                }
            ]
        } catch (err) {
            console.log('Error %j', err)
        }

    }
    async createSmartApp(): Promise<SmartApp> {
        if (!this.smartApp) {
            const smartApp = await this.clientConfig()
            this.smartApp = this.pages.configurePages(smartApp)
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
            .contextStore(this.contextStore())
            .withContext(installedAppId)
        return ret
    }
}

export const smartAppCreator = new SmartAppCreator()
