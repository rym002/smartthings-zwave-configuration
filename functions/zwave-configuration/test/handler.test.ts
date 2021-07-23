import { Command, Device } from '@smartthings/core-sdk'
import { assert, expect } from 'chai'
import 'mocha'
import * as nock from 'nock'
import { FakeContext, getContextSandbox, getItemMock, putItemMock, ssmMock, updateItemMock } from 'st-mocha-mocks'
import { handler } from '../src'
import { contextStoreCreator } from '../src/contextStore'
import { ProductIdKey, ProductIdMap, productService } from '../src/deviceInfo'
import { smartAppCreator } from '../src/smartapp'



interface ContextKey {
    id: string
}
interface ContextRecord {
    installedAppId: string
    locationId: string
    authToken: string
    refreshToken: string
    config: any
    state?: any
}

describe('ZWave Configuration', () => {
    beforeEach(function () {
        const sandbox = getContextSandbox(this)
        ssmMock(sandbox, [(path) => {
            return [
                {
                    Name: `${path}/clientId`,
                    Value: 'myClientId'
                },
                {
                    Name: `${path}/clientSecret`,
                    Value: 'myClientSecret'
                },
                {
                    Name: `${path}/appId`,
                    Value: 'myAppId'
                }
            ]
        }])
    })
    afterEach(() => {
        if (contextStoreCreator.createContextStore.cache.clear) {
            contextStoreCreator.createContextStore.cache.clear()
        }
        if (smartAppCreator.createSmartApp.cache.clear) {
            smartAppCreator.createSmartApp.cache.clear()
        }

        if (productService.db.cache.clear) {
            productService.db.cache.clear()
        }
        nock.cleanAll()
    })
    context('CONFIGURATION', () => {
        const root = 'configuration'
        context('INITIALIZE', () => {
            const folder = `${root}/initialize/`
            it('should return the main page for new install', async () => {
                await testRequest(`${folder}new-install`)
            })

            it('should return the product page if no product found', async function () {
                const sandbox = getContextSandbox(this)
                getItemMock(sandbox, [
                    smartappContextRetriever
                ])
                await testRequest(`${folder}installed-no-product`)
            })

            it('should return the deviceMain page for existing install', async function () {
                const sandbox = getContextSandbox(this)
                getItemMock(sandbox, [
                    smartappContextRetriever
                ])
                await testRequest(`${folder}installed-product`)
            })
        })
        context('PAGE', () => {
            const folder = `${root}/page/`
            beforeEach(function () {
                const sandbox = getContextSandbox(this)
                getItemMock(sandbox, [
                    smartappContextRetriever
                ])
                mockZwaveProduct(3600)
            })
            it('should return the main page', async () => {
                await testRequest(`${folder}main`)
            })
            it('should return the selectProduct page', async () => {
                mockDevice('myDeviceId', dev3600.id)
                await testRequest(`${folder}selectProduct`)
            })
            context('deviceMain', () => {
                beforeEach(() => {
                    mockDeviceState('myDeviceId', '99', ['1C'])
                })
                context('Parameters', () => {
                    const testFolder = `${folder}/parameter/`
                    it('should hide parameters when virtual device enabled', async () => {
                        await testRequest(`${testFolder}virtual`)
                    })
                    it('should return parameter with boolean and range with range enabled if boolean is false', async () => {
                        await testRequest(`${testFolder}boolean-false`)
                    })
                    it('should return parameter with boolean and range with range disabled if boolean is true', async () => {
                        await testRequest(`${testFolder}boolean-true`)
                    })
                    it('should return parameter with enum and range with range disabled if enum set', async () => {
                        await testRequest(`${testFolder}enum-range-enum-set`)
                    })
                    it('should return parameter with enum and range with range enabled if range set', async () => {
                        await testRequest(`${testFolder}enum-range-range-set`)
                    })
                    it('should disable device settings with default enabled', async () => {
                        await testRequest(`${testFolder}default`)
                    })
                })
                context('Association Groups', () => {
                })
                context('Device Info', () => {
                    const testFolder = `${folder}/deviceMain/`
                    it('should show product info', async () => {
                        await testRequest(`${testFolder}default`)
                    })
                    it('should hide association Groups when empty', async () => {
                        mockZwaveProduct(contextWithProductIdNoAssociationGroup.state?.['zwaveProductId'])
                        await testRequest(`${testFolder}no-association-group`)
                    })
                    it('should hide configuration Parameters when empty', async () => {
                        mockZwaveProduct(contextWithProductIdNoParameters.state?.['zwaveProductId'])
                        await testRequest(`${testFolder}no-parameters`)
                    })
                    it('should hide Supported command classes when empty', async () => {
                        mockZwaveProduct(contextWithProductIdNoSupportedCommandClasses.state?.['zwaveProductId'])
                        await testRequest(`${testFolder}no-supported-command-classes`)
                    })
                    it('should hide Controlled command classes when empty', async () => {
                        mockZwaveProduct(contextWithProductIdNoControlledCommandClasses.state?.['zwaveProductId'])
                        await testRequest(`${testFolder}no-controlled-command-classes`)
                    })
                    it('should hide S2 classes when empty', async () => {
                        mockZwaveProduct(contextWithProductIdNoS2CommandClasses.state?.['zwaveProductId'])
                        await testRequest(`${testFolder}no-s2-classes`)
                    })
                    it('should hide Features when empty', async () => {
                        mockZwaveProduct(contextWithProductIdNoFeatures.state?.['zwaveProductId'])
                        await testRequest(`${testFolder}no-features`)
                    })
                    it('should hide Texts when empty', async () => {
                        mockZwaveProduct(contextWithProductIdNoTexts.state?.['zwaveProductId'])
                        await testRequest(`${testFolder}no-texts`)
                    })
                    it('should hide Manual when empty', async () => {
                        mockZwaveProduct(contextWithProductIdNoManual.state?.['zwaveProductId'])
                        await testRequest(`${testFolder}no-manual`)
                    })
                })
            })
        })
    })
    context('App Management', () => {
        beforeEach(function () {
            const sandbox = getContextSandbox(this)
            getItemMock(sandbox, [
                smartappContextRetriever,
                productMapRetriever
            ])
        })
        context('INSTALL', () => {
            const root = 'install/'
            it('should update state for found deviceManufacturerCode', async function () {
                const deviceMock = nock('https://api.smartthings.com')
                    .get('/devices/myDeviceId')
                    .reply(200, {
                        deviceId: "myDeviceId",
                        deviceManufacturerCode: "0039-4944-3235"
                    })
                const supportedSpy = mockSupportedConfigurations([1, 2, 3, 4, 5])
                const zwMock = mockZwaveProduct(3600)
                const sandbox = getContextSandbox(this)
                let state
                const putItem = putItemMock(sandbox, [
                    (table, key: any) => {
                        state = key.state
                    }
                ])
                await testRequest(`${root}with-state`)
                deviceMock.done()
                supportedSpy.done()
                sandbox.assert.calledTwice(putItem)
                expect(state).to.eql({
                    zwaveProductId: 3600
                })
            })
            it('should success if missing deviceManufacturerCode', async function () {
                const smartthingsMock = nock('https://api.smartthings.com')
                    .get('/devices/myDeviceId')
                    .reply(200, {
                        deviceId: "myDeviceId",
                        deviceManufacturerCode: "0039-4944-0000"
                    })
                const sandbox = getContextSandbox(this)
                let stateUndefined = false
                const putItem = putItemMock(sandbox, [
                    (table, key: any) => {
                        stateUndefined = key.state == undefined
                    }
                ])
                await testRequest(`${root}without-state`)
                smartthingsMock.done()
                sandbox.assert.calledOnce(putItem)
                expect(stateUndefined, 'State should be undefined').to.be.true
            })
        })

        context('UPDATE', () => {
            const root = 'update/'
            beforeEach(function () {
                const zwMock = mockZwaveProduct(3600)
            })
            it('should update zwaveProductId', async function () {
                const sandbox = getContextSandbox(this)
                let product_saved: ProductIdMap | undefined = undefined
                const putItem = putItemMock(sandbox, [
                    (table, key: any) => {
                        switch (table) {
                            case 'smartapp':
                                break
                            case 'zwave_product_map':
                                product_saved = <ProductIdMap>key
                                break
                            default:
                                throw new Error('Invalid')
                        }
                    }
                ])
                const updateSpy = updateItemMock(sandbox, [
                    (table) => {

                    }
                ])
                mockZwaveProduct(3600)
                mockDevice('myDeviceId', dev3600.id)
                const supportedSpy = mockSupportedConfigurations([1, 2, 3, 4, 5])
                await testRequest(`${root}zwave-product-id`)
                sandbox.assert.calledTwice(putItem)
                expect(product_saved, 'ZWave Product Not Saved').to.eql(dev3600)
                sandbox.assert.calledOnce(updateSpy)
                supportedSpy.done()
            })
            context('Parameters', () => {
                const testFolder = `${root}/parameter/`
                beforeEach(function () {
                    mockDeviceState('myDeviceId', '99', [])
                    const sandbox = getContextSandbox(this)
                    getItemMock(sandbox, [
                        smartappContextRetriever
                    ])
                    const putItem = putItemMock(sandbox, [
                        (table, key: any) => {
                            switch (table) {
                                case 'smartapp':
                                    break
                                default:
                                    throw new Error('Invalid')
                            }
                        }
                    ])
                })
                it('should read range parameter', async function () {
                    const commandMock = mockUpdateParameter(1, [10], false)
                    await testRequest(`${testFolder}range`)
                    commandMock.done()
                })
                it('should read enum value', async function () {
                    const commandMock = mockUpdateParameter(2, [3], false)
                    await testRequest(`${testFolder}enum`)
                    commandMock.done()
                })
                it('should use boolean value if true', async function () {
                    const commandMock = mockUpdateParameter(5, [0], false)
                    await testRequest(`${testFolder}boolean-true`)
                    commandMock.done()
                })
                it('should use range value if boolean is false', async function () {
                    const commandMock = mockUpdateParameter(3, [11], false)
                    await testRequest(`${testFolder}boolean-false`)
                    commandMock.done()
                })
                it('should use enum value if set', async function () {
                    const commandMock = mockUpdateParameter(4, [1], false)
                    await testRequest(`${testFolder}enum-range`)
                    commandMock.done()
                })
                it('should skip update if current value matches', async function () {
                    const commandMock = mockUpdateParameter(1, [0], false)
                    await testRequest(`${testFolder}range`)
                    assert(!commandMock.isDone(), 'Command Not Executed')
                })
                it('should send value if refresh', async function () {
                    const commandMock = mockUpdateParameter(1, [3], true)
                    await testRequest(`${testFolder}refresh`)
                    commandMock.done()
                })
                it('should create virtual device when enabled')
            })

            context('Association Group', () => {
                const testFolder = `${root}associationGroup/`
                beforeEach(function () {
                    mockDeviceState('myDeviceId', '99', ['1C', '1D'])
                    mockDeviceState('device1C', '1C', [])
                    mockDeviceState('device1D', '1D', [])
                    mockDeviceState('device2A', '2A', [])
                    const sandbox = getContextSandbox(this)
                    getItemMock(sandbox, [
                        smartappContextRetriever
                    ])
                    const putItem = putItemMock(sandbox, [
                        (table, key: any) => {
                            switch (table) {
                                case 'smartapp':
                                    break
                                default:
                                    throw new Error('Invalid')
                            }
                        }
                    ])
                })
                it('should add missing associations', async function () {
                    const updateMock = mockUpdateAssociation(2, [42], [],'myDeviceId')
                    await testRequest(`${testFolder}add-association`)
                    updateMock.done()
                })
                it('should remove associations not in config', async function () {
                    const updateMock = mockUpdateAssociation(2, [], [29],'myDeviceId')
                    await testRequest(`${testFolder}remove-association`)
                    updateMock.done()
                })
                it('should not remove the lifeline device', async function () {
                    mockDeviceState('myLifelineDeviceId', '99', ['01', '1C', '1D'])
                    const updateMock = mockUpdateAssociation(2, [], [],'myLifelineDeviceId')
                    await testRequest(`${testFolder}lifeline-association`)
                    updateMock.done()
                })
            })
        })
        it('UNINSTALL', async function () {
            await testRequest('uninstall')
        })
    })
    context('Event', () => {
    })
})

async function testRequest(fileName: string): Promise<void> {
    const request = await import(`./data/request/${fileName}`)
    const response = await import(`./data/response/${fileName}`)
    return await new Promise((resolve, reject) => {
        handler(request, new FakeContext('123'), (error, result) => {
            if (!error) {
                try {
                    expect(response).to.eql(result, 'Response Error')
                    resolve()
                } catch (err) {
                    reject(err)
                }
            } else {
                reject(error)
            }
        })
    })
}

const contextNoState: ContextRecord = {
    installedAppId: 'noProductInstalledAppId',
    authToken: 'myAuthToken',
    locationId: 'myLocationId',
    refreshToken: 'myRefreshToken',
    config: {
        selectedZwaveDevice: [
            {
                valueType: "DEVICE",
                deviceConfig: {
                    deviceId: "myDeviceId",
                    componentId: "main"
                }
            }
        ]
    }
}

const contextWithProductId: ContextRecord = {
    ...contextNoState,
    installedAppId: 'installedAppIdWithProduct',
    state: {
        zwaveProductId: 3600
    }
}
const contextWithProductIdNoParameters: ContextRecord = {
    ...contextNoState,
    installedAppId: 'installedAppIdNoParameters',
    state: {
        zwaveProductId: 13600
    }
}

const contextWithProductIdNoAssociationGroup: ContextRecord = {
    ...contextNoState,
    installedAppId: 'installedAppIdNoAssociationGroup',
    state: {
        zwaveProductId: 23600
    }
}

const contextWithProductIdNoSupportedCommandClasses: ContextRecord = {
    ...contextNoState,
    installedAppId: 'installedAppIdNoSupportedCommandClasses',
    state: {
        zwaveProductId: 33600
    }
}

const contextWithProductIdNoControlledCommandClasses: ContextRecord = {
    ...contextNoState,
    installedAppId: 'installedAppIdNoControlledCommandClasses',
    state: {
        zwaveProductId: 43600
    }
}

const contextWithProductIdNoS2CommandClasses: ContextRecord = {
    ...contextNoState,
    installedAppId: 'installedAppIdNoS2CommandClasses',
    state: {
        zwaveProductId: 53600
    }
}

const contextWithProductIdNoFeatures: ContextRecord = {
    ...contextNoState,
    installedAppId: 'installedAppIdNoFeatures',
    state: {
        zwaveProductId: 63600
    }
}

const contextWithProductIdNoTexts: ContextRecord = {
    ...contextNoState,
    installedAppId: 'installedAppIdNoTexts',
    state: {
        zwaveProductId: 73600
    }
}

const contextWithProductIdNoManual: ContextRecord = {
    ...contextNoState,
    installedAppId: 'installedAppIdNoManual',
    state: {
        zwaveProductId: 83600
    }
}

const smartappContext = new Map<string, ContextRecord>()
smartappContext.set(`ctx:${contextNoState.installedAppId}`, contextNoState)
smartappContext.set(`ctx:${contextWithProductId.installedAppId}`, contextWithProductId)
smartappContext.set(`ctx:${contextWithProductIdNoParameters.installedAppId}`, contextWithProductIdNoParameters)
smartappContext.set(`ctx:${contextWithProductIdNoAssociationGroup.installedAppId}`, contextWithProductIdNoAssociationGroup)
smartappContext.set(`ctx:${contextWithProductIdNoSupportedCommandClasses.installedAppId}`, contextWithProductIdNoSupportedCommandClasses)
smartappContext.set(`ctx:${contextWithProductIdNoControlledCommandClasses.installedAppId}`, contextWithProductIdNoControlledCommandClasses)
smartappContext.set(`ctx:${contextWithProductIdNoS2CommandClasses.installedAppId}`, contextWithProductIdNoS2CommandClasses)
smartappContext.set(`ctx:${contextWithProductIdNoFeatures.installedAppId}`, contextWithProductIdNoFeatures)
smartappContext.set(`ctx:${contextWithProductIdNoTexts.installedAppId}`, contextWithProductIdNoTexts)
smartappContext.set(`ctx:${contextWithProductIdNoManual.installedAppId}`, contextWithProductIdNoManual)

const dev3600: ProductIdMap = {
    id: '0039-4944-3235',
    zWaveId: 3600
}
const zwaveProductMap = new Map<string, ProductIdMap>()
zwaveProductMap.set(`${dev3600.id}`, dev3600)

function mockDevice(deviceId: string, deviceManufacturerCode: string) {
    return nock(`https://api.smartthings.com/devices/${deviceId}`)
        .get('')
        .reply(200, {
            deviceId,
            deviceManufacturerCode
        })

}
function mockDeviceState(deviceId: string, deviceNetworkId: string, associations: string[]) {
    return nock(`https://api.smartthings.com/devices/${deviceId}`)
        .get('')
        .reply(200, <Device>{
            deviceId,
            components: [
                {
                    id: 'main',
                    label: 'My Label'
                }
            ]
        })
        .get('/status')
        .reply(200, {
            components: {
                main: {
                    "benchlocket65304.zwaveConfiguration": {
                        currentConfigurations: {
                            value: {
                                "1": [0],
                                "2": [0],
                                "3": [0],
                                "4": [10],
                                "5": [10]
                            },
                            timestamp: "2021-06-23T04:50:31.256Z"
                        },
                        associations: {
                            value: {
                                "1": ['01'],
                                "2": associations
                            }
                        },
                        deviceNetworkId: {
                            value: deviceNetworkId
                        }
                    }
                }
            }
        })
}

function mockZwaveProduct(productId: number) {
    return nock('https://products.z-wavealliance.org/products')
        .get(`/${productId}/JSON`)
        .replyWithFile(200, __dirname + `/data/nock/products/${productId}.json`)

}

function smartappContextRetriever(tableName: string, key: ContextKey) {
    if (tableName == 'smartapp') {
        return smartappContext.get(key.id)
    }
}

function productMapRetriever(tableName: string, key: ProductIdKey) {
    if (tableName == 'zwave_product_map') {
        return zwaveProductMap.get(key.id)
    }
}

function mockUpdateParameter(parameter: number, value: number[], defaultValue: boolean) {
    return mockCommand({
        capability: 'benchlocket65304.zwaveConfiguration',
        command: 'updateConfiguration',
        component: 'main',
        arguments: [parameter, value, defaultValue ? 1 : 0]
    }, 'myDeviceId')

}

function mockSupportedConfigurations(parameters: number[]) {
    return mockCommand({
        capability: 'benchlocket65304.zwaveConfiguration',
        command: 'supportedConfigurations',
        component: 'main',
        arguments: [parameters]
    }, 'myDeviceId')
}

function mockUpdateAssociation(group: number, add: number[], remove: number[],deviceId:string) {
    return mockCommand({
        capability: 'benchlocket65304.zwaveConfiguration',
        command: 'updateAssociation',
        component: 'main',
        arguments: [group, add, remove]
    }, deviceId)
}

function mockCommand(command: Command & nock.DataMatcherMap, deviceId: string) {
    return nock(`https://api.smartthings.com/devices/${deviceId}`)
        .post('/commands', {
            commands: [command]
        })
        .reply(200, {
            status: 'ACCEPTED'
        })
}