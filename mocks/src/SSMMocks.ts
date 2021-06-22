import { SSM } from "aws-sdk";
import { flatten } from 'lodash';
import { SinonSandbox } from 'sinon';
import { mockAwsWithSpy } from './AwsMock';

type SSMParameterRetriever = (path: string) => SSM.Parameter[]
function mockSSM(sandbox: SinonSandbox, resolver: (params: AWS.SSM.Types.GetParametersByPathRequest) => AWS.SSM.GetParametersByPathResult) {
    return mockAwsWithSpy(sandbox, 'SSM', 'getParametersByPath', resolver);
}

export function ssmMock(sandbox: SinonSandbox, retrievers: SSMParameterRetriever[]) {
    mockSSM(sandbox, (params: SSM.Types.GetParametersByPathRequest) => {
        const parameters = flatten(retrievers.map(retriever => {
            return retriever(params.Path)
        }))
        return {
            Parameters: parameters
        };
    });

}
