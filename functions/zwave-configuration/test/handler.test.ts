import { Device } from '@smartthings/core-sdk'
import { assert, expect } from 'chai'
import 'mocha'
import * as nock from 'nock'
import { FakeContext, getContextSandbox, ssmMock, getItemMock, updateItemMock, putItemMock } from 'st-mocha-mocks'
import { SinonSpy } from 'st-mocha-mocks/node_modules/@types/sinon'
import { handler } from '../src'
import { contextStoreCreator } from '../src/contextStore'
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
                    <ContextKey>(tableName: string, key: ContextKey) => {
                        return contextNoState
                    }
                ])
                await testRequest(`${folder}installed-no-product`)
            })

            it('should return the deviceMain page for existing install', async function () {
                const sandbox = getContextSandbox(this)
                getItemMock(sandbox, [
                    <ContextKey>(tableName: string, key: ContextKey) => {
                        return contextWithProductId
                    }
                ])
                await testRequest(`${folder}installed-product`)
            })
        })
        context('PAGE', () => {
            const folder = `${root}/page/`
            beforeEach(function () {
                const sandbox = getContextSandbox(this)
                getItemMock(sandbox, [
                    <ContextKey>(tableName: string, key: ContextKey) => {
                        return contextWithProductId
                    }
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
                    await testRequest(`${folder}parameter-boolean-range`)
                })
            })
            context('Association Group',()=>{
                
            })
        })
    })
    context('App Management', () => {
        beforeEach(function () {
            const sandbox = getContextSandbox(this)
            getItemMock(sandbox, [
                <ContextKey>(tableName: string, key: ContextKey) => {
                    return contextWithProductId
                }
            ])
            mockZwaveProduct(3600)
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
        it('UPDATE', async function () {
            // await testRequest('update')
            // if (this.test && this.test.ctx) {
            //     const smartthingsNock = <nock.Scope>this.test.ctx['smartthingsNock']
            //     expect(smartthingsNock.done(), 'Smartthings not called')
            // } else {
            //     assert(false, 'Test ctx not found')
            // }
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
            await testRequest('event-manufacturer')
            sandbox.assert.calledOnce(updateSpy)
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
    installedAppId: 'myinstalledAppId',
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
    state: {
        zwaveProductId: 3600
    }
}

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
                                "2": [1],
                                "3": [0],
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