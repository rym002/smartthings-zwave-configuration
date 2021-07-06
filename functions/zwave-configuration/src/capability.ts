import { DeviceStateContext } from '@smartthings/smartapp'
import { ManufacturerHex, ZwaveDevice } from './deviceInfo'
import { mapValues } from 'lodash'
import { DevicesEndpoint, SubscriptionsEndpoint, Status, ConfigEntry, Subscription, DeviceConfig, ConfigValueType } from '@smartthings/core-sdk'

interface Attribute<T> {
    value: T
    timestamp: string
}
export interface Manufacturer {
    productTypeId: number
    manufacturerId: number
    productId: number
}


interface CurrentConfigurations {
    [parameter: string]: number[]
}

interface ConvertedCurrentConfigurations {
    [parameter: string]: number
}

interface Command {
    command: string
    args?: (object | string | number)[]
}

export enum Attributes {
    manufacturer = 'manufacturer',
    currentConfigurations = 'currentConfigurations'
}

export class ZWaveDeviceState {
    constructor(readonly device: DeviceStateContext) {

    }
    private fromParameterValue(values: number[]): number {
        let ret = 0
        for (let index = 0; index < values.length; index++) {
            const value = values[index]
            ret += value << (index * 8)
        }
        return ret
    }
    getCurrentConfigurations(): ConvertedCurrentConfigurations {
        const capabilityState = this.device.state[ZWaveConfigurationCapability.CAPABILITY_ID]
        if (capabilityState) {
            const currentConfigurations = <Attribute<CurrentConfigurations>><unknown>capabilityState.currentConfigurations
            if (currentConfigurations) {
                const currentConfigurationsValue = currentConfigurations.value
                return mapValues(currentConfigurationsValue, (values) => {
                    return this.fromParameterValue(values)
                })
            }
        }
        throw new Error('Configuration Not Found')
    }

    getManufacturerInfo(): Manufacturer {
        const capabilityState = this.device.state[ZWaveConfigurationCapability.CAPABILITY_ID]
        if (capabilityState) {
            const manufacturerState = <Attribute<Manufacturer>><unknown>capabilityState.manufacturer
            if (manufacturerState) {
                const manufacturerValue = manufacturerState.value
                return manufacturerValue
            }
        }
        throw new Error('Manufacturer Not Found')
    }
}
export class ZWaveConfigurationCapability {
    static CAPABILITY_ID = 'benchlocket65304.zwaveConfiguration'
    private readonly deviceConfig: DeviceConfig
    constructor(readonly deviceConfigEntry: ConfigEntry[], readonly devicesEndpoint: DevicesEndpoint, readonly subscriptionsEndpoint: SubscriptionsEndpoint, readonly zwDevice: ZwaveDevice) {
        if (deviceConfigEntry && deviceConfigEntry[0].deviceConfig) {
            this.deviceConfig = deviceConfigEntry[0].deviceConfig
        } else {
            throw new Error('Invalid Device')
        }

    }


    private toParameterValue(value: number, size: number): number[] {
        const ret = []
        for (let index = 0; index < size; index++) {
            const byteValue = (value >> (index * 8)) & 0xff
            ret.push(byteValue)
        }
        return ret
    }
    private static toPaddedHex(value: number): string {
        return '0x' + value.toString(16).padStart(4, '0')
    }
    async refreshManufacturer(): Promise<Status> {
        const command: Command = {
            command: 'refreshManufacturer'
        }
        return this.executeCommand(command)
    }
    async supportedConfigurations(): Promise<Status> {
        const zwInfo = await this.zwDevice.deviceInfo()
        const parameters = zwInfo.ConfigurationParameters.map(cp => cp.ParameterNumber)
        const command: Command = {
            command: 'supportedConfigurations',
            args: [parameters]
        }
        return this.executeCommand(command)
    }
    async updateConfiguration(parameterNumber: number, defaultValue: boolean, value?: number, size?: number): Promise<Status> {
        let configurationValue: number[] = []
        if (value != undefined && size) {
            configurationValue = this.toParameterValue(value, size)
        }
        const command: Command = {
            command: 'updateConfiguration',
            args: [parameterNumber, configurationValue, defaultValue ? 1 : 0]
        }
        return this.executeCommand(command)
    }

    private async executeCommand(command: Command): Promise<Status> {
        return await this.devicesEndpoint.executeCommand(this.deviceConfig.deviceId, {
            capability: ZWaveConfigurationCapability.CAPABILITY_ID,
            component: this.deviceConfig.componentId,
            command: command.command,
            arguments: command.args
        })
    }

    static toManufacturerHex(manufacturer: Manufacturer): ManufacturerHex {
        return {
            manufacturerId: this.toPaddedHex(manufacturer.manufacturerId),
            productId: this.toPaddedHex(manufacturer.productId),
            productTypeId: this.toPaddedHex(manufacturer.productTypeId)
        }
    }
}