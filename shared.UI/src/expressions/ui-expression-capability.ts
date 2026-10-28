import type {
  ExpressionCapability,
  ExpressionCapabilityDelegate,
  ExpressionDelegatedFunctionCall,
} from '@manatos/shared';

import type { ManatosApiClient } from '../api/api-client.js';

interface ExpressionFunctionResponse {
  value: unknown;
}

/** Browser-side adapter for expression capabilities deliberately delegated to the ManatOS API. */
export class UiExpressionCapabilityClient implements ExpressionCapabilityDelegate {
  readonly capabilities: readonly ExpressionCapability[] = ['entityResolver'];

  constructor(private readonly api: ManatosApiClient) {}

  async evaluateFunction(call: ExpressionDelegatedFunctionCall): Promise<unknown> {
    const response = await this.api.post<ExpressionFunctionResponse>(
      '/api/v1/expressions/evaluate-function',
      {
        functionName: call.functionName,
        args: [...call.args],
      },
    );

    return response.data.value;
  }
}
