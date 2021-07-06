import { Device, Command } from '@smartthings/core-sdk'
import { assert, expect } from 'chai'
import 'mocha'
import * as nock from 'nock'
import { FakeContext, getContextSandbox, ssmMock, getItemMock, updateItemMock, putItemMock } from 'st-mocha-mocks'
import { handler } from '../src'
import { contextStoreCreator } from '../src/contextStore'
import { smartAppCreator } from '../src/smartapp'
import { ManufacturerHex, ProductIdMap, productService } from '../src/deviceInfo'



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

describe('Test Test', () => {
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
                mockDeviceState('myDeviceId')
                await testRequest(`${folder}selectProduct`)
            })
            it('should return the deviceMain page with product found', async () => {
                mockZwaveProduct(3600)
                await testRequest(`${folder}deviceMain`)
            })
            context('Parameter', () => {
                beforeEach(function () {
                    mockDeviceState('myDeviceId')
                })
                it('should return parameter with range', async () => {
                    await testRequest(`${folder}parameter-range`)
                })
                it('should return parameter with enum', async () => {
                    await testRequest(`${folder}parameter-enum`)
                })
                it('should return return only boolean when the current value matches the boolean', async () => {
                    await testRequest(`${folder}parameter-boolean`)
                })
                it('should return parameter with boolean and range when the current', async () => {
                    await testRequest(`${folder}parameter-enum-range`)
                })
                it('should display device settings with virtual device enabled')
                it('should disable device settings with default enabled', async () => {
                    await testRequest(`${folder}parameter-default`)
                })
            })
            context('Association Group', () => {
                it('should show current associations')
            })
        })
    })
    context('App Management', () => {
        beforeEach(function () {
            const sandbox = getContextSandbox(this)
            getItemMock(sandbox, [
                smartappContextRetriever
            ])
        })
        it('INSTALL', async function () {
            const smartthingsMock = nock('https://api.smartthings.com')
                .post('/installedapps/myInstalledAppId/subscriptions',
                    {
                        sourceType: 'DEVICE',
                        device: {
                            deviceId: 'myDeviceId',
                            componentId: 'main',
                            capability: 'benchlocket65304.zwaveConfiguration',
                            attribute: 'manufacturer',
                            stateChangeOnly: true,
                            subscriptionName: 'manufacturerEvent_0',
                            value: '*'
                        }
                    })
                .reply(200, {})
                .post('/devices/myDeviceId/commands', {
                    commands: [
                        {
                            capability: 'benchlocket65304.zwaveConfiguration',
                            component: 'main',
                            command: 'refreshManufacturer'
                        }
                    ]
                })
                .reply(200, {
                    results: [
                        {
                            id: "replyId",
                            status: "ACCEPTED"
                        }
                    ]
                })
            const sandbox = getContextSandbox(this)
            const putItem = putItemMock(sandbox, [
                (table, key: any) => {

                }
            ])
            await testRequest('install')
            expect(smartthingsMock.done(), 'Smartthings not called')
            sandbox.assert.calledOnce(putItem)
        })
        context('UPDATE', () => {
            const root = 'update/'
            beforeEach(function () {
                const stateMock = mockDeviceState('myDeviceId')
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
                const supportedSpy = mockSupportedConfigurations([1,2,3,4])
                await testRequest(`${root}zwave-product-id`)
                sandbox.assert.calledTwice(putItem)
                expect(product_saved, 'ZWave Product Not Saved').to.eql(dev1Map)
                sandbox.assert.calledOnce(updateSpy)
                supportedSpy.done()
            })
            context('Parameters', () => {
                beforeEach(function () {
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
                    await testRequest(`${root}parameter-range`)
                    commandMock.done()
                })
                it('should read enum value', async function () {
                    const commandMock = mockUpdateParameter(2, [3], false)
                    await testRequest(`${root}parameter-enum`)
                    commandMock.done()
                })
                it('should use boolean value if true', async function () {
                    const commandMock = mockUpdateParameter(3, [0], false)
                    await testRequest(`${root}parameter-boolean-true`)
                    commandMock.done()
                })
                it('should use range value if boolean is false', async function () {
                    const commandMock = mockUpdateParameter(3, [11], false)
                    await testRequest(`${root}parameter-boolean-false`)
                    commandMock.done()
                })
                it('should use enum value if set', async function () {
                    const commandMock = mockUpdateParameter(4, [1], false)
                    await testRequest(`${root}parameter-enum-range`)
                    commandMock.done()
                })
                it('should skip update if current value matches', async function () {
                    const commandMock = mockUpdateParameter(1, [0], false)
                    await testRequest(`${root}parameter-range`)
                    assert(!commandMock.isDone(), 'Command Not Executed')
                })
                it('should send value if refresh', async function () {
                    const commandMock = mockUpdateParameter(1, [3], true)
                    await testRequest(`${root}parameter-refresh`)
                    commandMock.done()
                })
                it('should create virtual device when enabled')
            })
            it('should update association group')
        })
        it('UNINSTALL', async function () {
            await testRequest('uninstall')
        })
    })
    context('Event', () => {
        it('EVENT manufacturer', async function () {
            const sandbox = getContextSandbox(this)
            const updateSpy = updateItemMock(sandbox, [
                (table) => {

                }
            ])
            getItemMock(sandbox, [
                smartappContextRetriever,
                productMapRetriever
            ])
            mockZwaveProduct(3600)
            const supportedSpy = mockSupportedConfigurations([1,2,3,4])
            await testRequest('event-manufacturer')
            sandbox.assert.calledOnce(updateSpy)
            supportedSpy.done()
        })
    })
})

async function testRequest(fileName: string): Promise<void> {
    const request = await import(`./data/request/${fileName}`)
    const response = await import(`./data/response/${fileName}`)
    return await new Promise((resolve, reject) => {
        handler(request, new FakeContext('123'), (error, result) => {
            if (!error) {
                try {
                    expect(result).to.eql(response, 'Response Error')
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

const smartappContext = new Map<string, ContextRecord>()
smartappContext.set(`ctx:${contextNoState.installedAppId}`, contextNoState)
smartappContext.set(`ctx:${contextWithProductId.installedAppId}`, contextWithProductId)

const dev1Map: ProductIdMap = {
    manufacturerId: '0x0039',
    productId: '0x3235',
    productTypeId: '0x4944',
    zWaveId: 3600
}
const zwaveProductMap = new Map<string, ProductIdMap>()
zwaveProductMap.set(`${dev1Map.manufacturerId}${dev1Map.productTypeId}${dev1Map.productId}`, dev1Map)

function mockDeviceState(deviceId: string) {
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
                                "3": [10],
                                "4": [10]
                            },
                            timestamp: "2021-06-23T04:50:31.256Z"
                        },
                        manufacturer: {
                            value: {
                                productTypeId: 18756,
                                manufacturerId: 57,
                                productId: 12853
                            },
                            timestamp: "2021-06-23T04:50:31.256Z"
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

function productMapRetriever(tableName: string, key: ManufacturerHex) {
    if (tableName == 'zwave_product_map') {
        return zwaveProductMap.get(`${key.manufacturerId}${key.productTypeId}${key.productId}`)
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

function mockSupportedConfigurations(parameters:number[]){
    return mockCommand({
        capability: 'benchlocket65304.zwaveConfiguration',
        command: 'supportedConfigurations',
        component: 'main',
        arguments: [parameters]
    }, 'myDeviceId')

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