import { DynamoDB } from "aws-sdk"
import { SinonSandbox } from 'sinon'
import { mockAwsWithSpy } from './AwsMock'


type GetRetriever = <T extends object>(table: string, key: T) => object
type PutRetriever = <T extends object>(table: string, key: T) => void
type UpdateRetriever = (table: string) => void

function mockGetItem(sandbox: SinonSandbox, resolver: (params: DynamoDB.Types.GetItemInput) => DynamoDB.GetItemOutput) {
    return mockAwsWithSpy(sandbox, 'DynamoDB', 'getItem', resolver);
}

function mockPutItem(sandbox: SinonSandbox, resolver: (params: DynamoDB.Types.PutItemInput) => DynamoDB.PutItemOutput) {
    return mockAwsWithSpy(sandbox, 'DynamoDB', 'putItem', resolver);
}

function mockDeleteItem(sandbox: SinonSandbox, resolver: (params: DynamoDB.Types.DeleteItemInput) => DynamoDB.DeleteItemOutput) {
    return mockAwsWithSpy(sandbox, 'DynamoDB', 'deleteItem', resolver);
}

function mockUpdateItem(sandbox: SinonSandbox, resolver: (params: DynamoDB.Types.UpdateItemInput) => DynamoDB.UpdateItemOutput) {
    return mockAwsWithSpy(sandbox, 'DynamoDB', 'updateItem', resolver);
}

export function getItemMock(sandbox: SinonSandbox, retrievers: GetRetriever[]) {
    return mockGetItem(sandbox, (params: DynamoDB.Types.GetItemInput) => {
        const convertedKey = DynamoDB.Converter.unmarshall(params.Key)
        const items = retrievers.map(retriever => {
            return retriever(params.TableName, convertedKey)
        })
            .filter(item => item != undefined)
            .reduce((prev, current) => {
                return {
                    ...prev,
                    ...current
                }
            })
        return {
            Item: DynamoDB.Converter.marshall(items)
        };
    });
}

export function putItemMock(sandbox: SinonSandbox, retrievers: PutRetriever[]) {
    return mockPutItem(sandbox, (params: DynamoDB.Types.PutItemInput) => {
        const convertedItem = DynamoDB.Converter.unmarshall(params.Item)
        retrievers.forEach(retriever => {
            retriever(params.TableName, convertedItem)
        })
        return {
        };
    });
}

export function deleteItemMock(sandbox: SinonSandbox, retrievers: GetRetriever[]) {
    return mockDeleteItem(sandbox, (params: DynamoDB.Types.DeleteItemInput) => {
        const convertedKey = DynamoDB.Converter.unmarshall(params.Key)
        retrievers.forEach(retriever => {
            return retriever(params.TableName, convertedKey)
        })
        return {
        };
    });
}

export function updateItemMock(sandbox: SinonSandbox, retrievers: UpdateRetriever[]) {
    return mockUpdateItem(sandbox, (params: DynamoDB.Types.UpdateTableInput) => {
        retrievers.forEach(retriever => {
            return retriever(params.TableName)
        })
        return {
        };
    });
}
