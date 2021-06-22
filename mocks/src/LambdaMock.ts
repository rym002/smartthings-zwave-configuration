import { Context } from "aws-lambda";

export class FakeContext implements Context{
    callbackWaitsForEmptyEventLoop: boolean = false;    
    functionName: string = 'test';
    functionVersion: string = '1';
    invokedFunctionArn: string = ' abc';
    memoryLimitInMB: string = '100';
    logGroupName: string = 'logGroup';
    logStreamName: string = 'logStream';
    constructor(readonly awsRequestId:string){

    }
    getRemainingTimeInMillis(): number {
        return 100
    }
    done(error?: Error, result?: any): void {
    }
    fail(error: string | Error): void {
    }
    succeed(messageOrObject: any): void;
    succeed(message: string, object: any): void;
    succeed(message: any, object?: any) {
    }
}

export function fakeCallback<TResult = any> (error?: Error | null | string, result?: TResult) {

}