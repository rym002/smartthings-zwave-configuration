import { ContextStore, ContextRecord } from '@smartthings/smartapp'
import { DynamoDB } from 'aws-sdk'
import { memoize } from 'lodash'

const DynamoDBContextStore = require('@smartthings/dynamodb-context-store')

export interface ContextRecordWithState<T> extends ContextRecord {
    state?: T
}
/**
 * Some reason the ts does not incude update and delete
 */
interface ContextStoreFull<T> extends ContextStore {
    get(installedAppId: string): Promise<ContextRecordWithState<T>>
    update(installedAppId: string, contextRecord: Partial<ContextRecordWithState<T>>): Promise<void>
    delete(installedAppId: string): Promise<void>
	put(contextRecord: ContextRecordWithState<T>): Promise<ContextRecordWithState<T>>
}

interface DynamoContextStoreFull extends ContextStore {
    update(installedAppId: string, contextRecord: ContextRecord): Promise<DynamoDB.UpdateItemOutput>
    delete(installedAppId: string): Promise<DynamoDB.DeleteItemOutput>
}

class MemoizedContextStore<T> implements ContextStoreFull<T> {
    constructor(readonly backingStore: DynamoContextStoreFull) {

    }
    get = memoize(this.backingStore.get.bind(this.backingStore))

    async put(contextRecord: ContextRecordWithState<T>): Promise<ContextRecord> {
        if (!contextRecord.state) {
            const current = <ContextRecordWithState<T>>await this.get(contextRecord.installedAppId)
            if (current && current.state) {
                contextRecord.state = current.state
            }
        }
        this.get.cache.delete(contextRecord.installedAppId)
        return this.backingStore.put(contextRecord)
    }
    async update(installedAppId: string, contextRecord: ContextRecord): Promise<void> {
        this.get.cache.delete(installedAppId)
        await this.backingStore.update(installedAppId, contextRecord)
    }
    async delete(installedAppId: string): Promise<void> {
        this.get.cache.delete(installedAppId)
        await this.backingStore.delete(installedAppId)
    }
}



class ContextStoreCreator {
    private _createContextStore<T>(): ContextStoreFull<T> {
        return <ContextStoreFull<T>>new MemoizedContextStore(
            new DynamoDBContextStore({
                autoCreate: false,
                AWSRegion: process.env.AWS_REGION,
                table: {
                    name: process.env.context_store_table
                }
            })
        )
    }
    createContextStore = memoize(this._createContextStore)
}

export const contextStoreCreator = new ContextStoreCreator()