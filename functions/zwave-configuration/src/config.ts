import { SSM } from 'aws-sdk'

const ssm = new SSM()
const ENV = process.env['ENV'] || 'dev';

interface AppClientConfig {
    clientId: string,
    clientSecret: string
    [key: string]: string
}
let _appClientConfig: AppClientConfig | undefined

async function appClientConfig(): Promise<AppClientConfig> {
    if (!_appClientConfig) {
        const prefix = parameterPrefix()
        const parameters = await ssm.getParametersByPath({
            Path: prefix,
            WithDecryption: true
        }).promise()
        const config: AppClientConfig = {
            clientId: '',
            clientSecret: ''
        }
        if (parameters.Parameters) {
            parameters.Parameters.map(parameter => {
                if (parameter.Name && parameter.Value) {
                    const name = parameter.Name.substring(prefix.length)
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


export default appClientConfig()
