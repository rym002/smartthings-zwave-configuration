import { PermissionsEnum, SmartApp } from '@smartthings/smartapp'
import appConfig from './config'
const DynamoDBContextStore = require('@smartthings/dynamodb-context-store')

let smartApp: SmartApp | undefined


async function createSmartApp(): Promise<SmartApp> {
    if (!smartApp) {
        const config = await appConfig
        smartApp = new SmartApp()
            .enableEventLogging()
            .configureI18n()
            .clientId(config.clientId)
            .clientSecret(config.clientSecret)
            .contextStore(new DynamoDBContextStore({
                autoCreate: false,
                AWSRegion: process.env.AWS_REGION,
                table: {
                    name: process.env.context_store_table
                }
            })).page('main', async (context, page, configData): Promise<void> => {
                page.section('zwaveDevice', section => {
                    section
                        .deviceSetting('selectedZwaveDevice')
                        .capability('benchlocket65304.zwaveConfiguration')
                        .required(true)
                        .multiple(false)
                        .permissions([PermissionsEnum.R, PermissionsEnum.X])
                })
                const authContext = await context.retrieveTokens()
                if (authContext.isAuthenticated()) {
                    page.nextPageId('deviceInfo')
                } else {
                    page.complete(true)
                }
            }).page('deviceInfo', async (context, page, configData) => {
                const authContext = await context.retrieveTokens()
                const deviceContext = await authContext.configDevices('selectedZwaveDevice')
                deviceContext[0].name
                page.section('zwaveCapabilities', section => {
                    section
                        .textSetting('test')
                        .defaultValue(deviceContext[0].name)
                })
                page.complete(true)

            })
    }
    return smartApp
}



export default createSmartApp()