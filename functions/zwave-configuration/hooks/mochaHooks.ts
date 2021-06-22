import * as AWS from 'aws-sdk'
import { restoreMocks, setupSDK, createContextSandbox, restoreSandbox } from 'st-mocha-mocks'

before(function () {
    setupSDK(AWS)
})

beforeEach(function () {
    createContextSandbox(this)
})
afterEach(function () {
    restoreMocks()
    restoreSandbox(this)
})