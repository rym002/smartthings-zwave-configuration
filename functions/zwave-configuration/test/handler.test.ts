import 'mocha'
import { handler } from '../src'
import { ssmMock, FakeContext, getContextSandbox, mockAwsWithSpy } from 'st-mocha-mocks'
import { expect, assert } from 'chai'
import { DynamoDB } from 'aws-sdk'
import * as nock from 'nock'

interface ContextRecord {
    installedAppId: string
    locationId: string
    authToken: string
    refreshToken: string
    config: any
    state: any
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
        mockAwsWithSpy(sandbox, 'DynamoDB', 'getItem', (params: DynamoDB.GetItemInput): DynamoDB.GetItemOutput => {
            let item: DynamoDB.AttributeMap | undefined
            if (params.Key.id.S == 'ctx:myInstalledAppId') {
                const context: ContextRecord = {
                    installedAppId: 'myInstalledAppId',
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
                        ],
                        zwaveProductId: [
                            {
                                valueType: "STRING",
                                stringConfig: {
                                    value: "3600"
                                }
                            }
                        ]
                    },
                    state: {}
                }
                item = DynamoDB.Converter.marshall(context)
            }
            return {
                Item: item
            }
        })

        nock('https://products.z-wavealliance.org/products')
            .get('/3600/JSON')
            .reply(200, async (context, uri) => {
                const data = await import(`./data/nock/products/3600.json`)
                return data
            })
        mockAwsWithSpy(sandbox, 'DynamoDB', 'putItem', (params: DynamoDB.PutItemInput): DynamoDB.PutItemOutput => {
            return {
                Attributes: params.Item
            }
        })
        mockAwsWithSpy(sandbox, 'DynamoDB', 'deleteItem', (params: DynamoDB.DeleteItemInput): DynamoDB.DeleteItemOutput => {
            return {
                Attributes: params.Key
            }
        })
        mockAwsWithSpy(sandbox, 'DynamoDB', 'updateItem', (params: DynamoDB.UpdateItemInput): DynamoDB.UpdateItemOutput => {
            return {
                Attributes: params.Key
            }
        })

    })
    context('Pages', () => {
        it('INITIALIZE should return the main page', async () => {
            await testRequest('initialize')
        })
        it('CONFIGURATION main PAGE for new install', async () => {
            await testRequest('page-main-new')
        })
        it('INITIALIZE should return the main page for existing install', async () => {
            await testRequest('initialize-installed')
        })
        it('CONFIGURATION main PAGE for exiting install', async () => {
            await testRequest('page-main-installed')
        })
    })
    context('App Management', () => {
        beforeEach(function () {
            if (this.currentTest && this.currentTest.ctx) {
                this.currentTest.ctx['smartthingsNock'] = nock('https://api.smartthings.com')
                    .delete('/installedapps/myInstalledAppId/subscriptions')
                    .reply(200, {})
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

            }
            const sandbox = getContextSandbox(this)
        })
        afterEach(() => {
            nock.cleanAll()
        })
        it('INSTALL', async function () {
            await testRequest('install')
            if (this.test && this.test.ctx) {
                const smartthingsNock = <nock.Scope>this.test.ctx['smartthingsNock']
                expect(smartthingsNock.done(), 'Smartthings not called')
            } else {
                assert(false, 'Test ctx not found')
            }
        })
        it('UPDATE', async function () {
            await testRequest('update')
            if (this.test && this.test.ctx) {
                const smartthingsNock = <nock.Scope>this.test.ctx['smartthingsNock']
                expect(smartthingsNock.done(), 'Smartthings not called')
            } else {
                assert(false, 'Test ctx not found')
            }
        })
        it('UNINSTALL', async function () {
            await testRequest('uninstall')
        })
    })
    context('Event', () => {
        it('EVENT manufacturer', async () => {
            await testRequest('event-manufacturer')
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