import { SSM } from 'aws-sdk'

const ENV = process.env['ENV'] || 'dev';

interface AppClientConfig {
    clientId: string,
    clientSecret: string,
    appId: string,
    [key: string]: string
}
let _appClientConfig: AppClientConfig | undefined

async function appClientConfig(): Promise<AppClientConfig> {
    if (!_appClientConfig) {
        const prefix = parameterPrefix()
        const ssm = new SSM()
        const parameters = await ssm.getParametersByPath({
            Path: prefix,
            WithDecryption: true
        }).promise()
        const config: AppClientConfig = {
            clientId: '',
            clientSecret: '',
            appId: ''
        }
        if (parameters.Parameters) {
            parameters.Parameters.map(parameter => {
                if (parameter.Name && parameter.Value) {
                    const name = parameter.Name.substring(prefix.length + 1)
                    const value = parameter.Value
                    config[name] = value
                }
            })
            _appClientConfig = config
        } else {
            throw parameters.$response.error
        }
    }
    return _appClientConfig;
}

function parameterPrefix(): string {
    return '/smartthings/' + ENV + '/zwaveConfiguration'
}


export default appClientConfig
