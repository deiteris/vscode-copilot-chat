/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { RawMessageConversionCallback } from '../../../platform/networking/common/openai';
import { OpenAIEndpoint } from './openAIEndpoint';

/**
 * Azure-specific OpenAI endpoint that supports Entra ID authentication.
 * Extends OpenAIEndpoint to override header generation for Azure-specific auth methods.
 * Note: Authentication token refresh is handled at the provider level (azureProvider.ts).
 */
export class AzureOpenAIEndpoint extends OpenAIEndpoint {
	/**
	 * Override to use Entra ID authentication headers instead of API key.
	 */
	public override getExtraHeaders(): Record<string, string> {
		const headers = super.getExtraHeaders();
		headers['Authorization'] = `Bearer ${this._apiKey}`;
		// Defensive: Ensure 'api-key' header is never sent for Azure endpoints, even if parent class changes.
		delete headers['api-key'];
		return headers;
	}

	/**
	 * Override to use Azure-specific `cot_id`/`cot_summary` fields for encrypted thinking.
	 */
	protected override getThinkingCallback(): RawMessageConversionCallback {
		return (out, data) => {
			if (data && data.id) {
				out.cot_id = data.id;
				out.cot_summary = Array.isArray(data.text) ? data.text.join('') : data.text;
			}
		};
	}
}
