import { PermissionsEnum, SmartApp } from '@smartthings/smartapp'
import { Handler } from "aws-lambda";
import { ConfigEntry } from '@smartthings/core-sdk'

const smartapp = new SmartApp()
    .enableEventLogging()
    .configureI18n()
    .page('main', async (context, page, configData) => {
        console.log('main configData: %j', configData)
        page.section('zwaveDevice', section => {
            section
                .deviceSetting('selectedZwaveDevice')
                .capability('benchlocket65304.zwaveConfiguration')
                .required(true)
                .multiple(false)
                .permissions([PermissionsEnum.R, PermissionsEnum.W, PermissionsEnum.X])
        })
        page.nextPageId('deviceInfo')
    }).page('deviceInfo', async (context, page, configData) => {
        console.log('deviceInfo configData: %j', configData)
        const selectedZwaveDevice = <ConfigEntry[]><any>configData?.config.selectedZwaveDevice
        const deviceId = 'selectedZwaveDevice' //[0].deviceConfig?.deviceId
        console.log('deviceId %s', deviceId)
        console.log('context %j', context.api.devices)
        if (deviceId) {
//            const configDevices = await context.configDevices(deviceId)
  //          console.log('configDevices %j', configDevices)
        }
        page.section('zwaveCapabilities', section => {
            section
                .textSetting('test')
        })
        page.complete(true)

    })
    .updated((context, updateData) => {
        console.log("updateData: %j", updateData)
    }).uninstalled((context, uninstallData)=>{
        console.log("uninstallData: %j", uninstallData)
    })


export const handler: Handler<any, any> = (event, context, callback) => {
    smartapp.handleLambdaCallback(event, context, callback)
}
