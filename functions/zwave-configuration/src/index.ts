import { Handler } from "aws-lambda";
import createSmartApp from './smartapp'


export const handler: Handler<any, any> = (event, context, callback) => {
    createSmartApp
        .then(smartapp => {
            smartapp.handleLambdaCallback(event, context, callback)
        })
}
