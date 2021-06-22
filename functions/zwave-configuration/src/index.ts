import { Handler } from "aws-lambda";
import { smartAppCreator } from './smartapp'


export const handler: Handler<any, any> = async (event, context, callback) => {
    const smartapp = await smartAppCreator.createSmartApp()
    return smartapp.handleLambdaCallback(event, context, callback)
}
