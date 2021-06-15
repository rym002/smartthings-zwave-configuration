import { Handler } from "aws-lambda";
import SmartApp from './smartapp'


export const handler: Handler<any, any> = async (event, context, callback) => {
    const smartapp = await SmartApp
    smartapp.handleLambdaCallback(event, context, callback)
}
