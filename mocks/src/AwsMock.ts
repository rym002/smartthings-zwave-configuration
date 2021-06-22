import { SinonSandbox } from 'sinon';
import * as AWSMock from 'aws-sdk-mock';

const activeMocks = new Map<string, Set<string>>()


export function setupSDK(instance: object) {
    AWSMock.setSDKInstance(instance);
}

export function restoreMocks() {
    activeMocks.forEach((methods,service)=>{
        methods.forEach(method=>{
            AWSMock.restore(service,method)
        })
    })
    activeMocks.clear()
}

function createAwsMockSpy<REQ, RES>(sandbox: SinonSandbox, resolver: (params: REQ) => RES) {
    return sandbox.spy((params: REQ, callback: (err: any, data: RES | undefined) => void) => {
        try {
            const data = resolver(params);
            callback(undefined, data);
        }
        catch (err) {
            callback(err, undefined);
        }
    });
}

export function mockAwsWithSpy<REQ, RES>(sandbox: SinonSandbox, service: string, method: string, resolver: (params: REQ) => RES) {
    const callSpy = createAwsMockSpy(sandbox, resolver);
    if (isMocked(service, method)) {
        AWSMock.remock(service, method, callSpy)
    } else {
        AWSMock.mock(service, method, callSpy);
        trackMock(service, method)
    }
    return callSpy;
}

function trackMock(service: string, method: string) {
    let serviceMethods = activeMocks.get(service)
    if (!serviceMethods) {
        serviceMethods = new Set()
        activeMocks.set(service, serviceMethods)
    }
    serviceMethods.add(method)
}

function isMocked(service: string, method: string) {
    const serviceMethods = activeMocks.get(service)
    return serviceMethods && serviceMethods.has(service)
}