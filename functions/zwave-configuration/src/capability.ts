import { DeviceStateContext } from '@smartthings/smartapp'
import { ZwaveDeviceInfo } from './deviceInfo'
import { difference, mapValues } from 'lodash'
import { DevicesEndpoint, SubscriptionsEndpoint, Status, ConfigEntry, DeviceConfig } from '@smartthings/core-sdk'

interface Attribute<T> {
    value: T
    timestamp: string
}

interface ZWaveKeyValue {
    [parameter: string]: number[]
}

interface ConvertedCurrentConfigurations {
    [parameter: string]: number
}
interface ConvertedAssociationGroups {
    [parameter: string]: string[]
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
    private toHex(value: number): string {
        return value.toString(16).padStart(2, '0')
    }
    private fromParameterValue(values: number[]): number {
        let ret = 0
        for (let index = 0; index < values.length; index++) {
            const value = values[index]
            ret += value << (index * 8)
        }
        return ret
    }

    get capabilityState() {
        const capabilityState = this.device.state[ZWaveConfigurationCapability.CAPABILITY_ID]
        if (capabilityState) {
            return capabilityState
        }
        throw new Error('Configuration Not Found')
    }
    get currentConfigurations(): ConvertedCurrentConfigurations {
        const capabilityState = this.capabilityState
        const currentConfigurations = <Attribute<ZWaveKeyValue>><unknown>capabilityState.currentConfigurations
        if (currentConfigurations) {
            const currentConfigurationsValue = currentConfigurations.value
            return mapValues(currentConfigurationsValue, (values) => {
                return this.fromParameterValue(values)
            })
        }
        throw new Error('Current Configurations Not Found')
    }
    get associations(): ConvertedAssociationGroups {
        const capabilityState = this.capabilityState
        const associations = <Attribute<ZWaveKeyValue>><unknown>capabilityState.associations
        if (associations) {
            const currentConfigurationsValue = associations.value
            return mapValues(currentConfigurationsValue, (values) => {
                return values.map(value => {
                    return this.toHex(value)
                })
            })
        }
        throw new Error('Associations Not Found')
    }

    get deviceNetworkId(): string {
        const capabilityState = this.capabilityState
        const deviceNetworkId = <Attribute<string>><unknown>capabilityState.deviceNetworkId
        if (deviceNetworkId) {
            return deviceNetworkId.value
        }
        throw new Error('Device Network Id Not Found')
    }
}
export class ZWaveConfigurationCapability {
    static CAPABILITY_ID = 'benchlocket65304.zwaveConfiguration'
    private readonly deviceConfig: DeviceConfig
    constructor(readonly deviceConfigEntry: ConfigEntry[], readonly devicesEndpoint: DevicesEndpoint, readonly subscriptionsEndpoint: SubscriptionsEndpoint, readonly zwDevice: ZwaveDeviceInfo) {
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
    async supportedConfigurations(): Promise<Status> {
        const zwInfo = await this.zwDevice.deviceInfo()
        const parameters = zwInfo.ConfigurationParameters.map(cp => cp.ParameterNumber)
        const command: Command = {
            command: 'supportedConfigurations',
            args: [parameters]
        }
        return await this.executeCommand(command)
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

    private fromHex(value: string): number {
        return parseInt(value, 16)
    }

    async updateAssociation(groupId: number, destinationNodes: string[], currentNodes: string[]) {
        const nodesToAdd = difference(destinationNodes, currentNodes)
            .map(node => this.fromHex(node))
        const nodesToRemove = difference(currentNodes, destinationNodes)
            .map(node => this.fromHex(node))
            .filter(nodeId => nodeId != 1)
        const command: Command = {
            command: 'updateAssociation',
            args: [groupId, nodesToAdd, nodesToRemove]
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
}