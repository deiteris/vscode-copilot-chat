/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { OllamaLMProvider } from '../ollamaProvider';

describe('OllamaLMProvider', () => {
	it('returns successful models when one /api/show lookup fails', async () => {
		const ollamaBaseUrl = 'http://localhost:11434';
		const tagsModels = [{ model: 'good-model-a' }, { model: 'bad-model' }, { model: 'good-model-b' }];
		const showCalls: string[] = [];

		const fetch = vi.fn(async (url: string, options: { body?: string; headers?: Record<string, string> }) => {
			if (url === `${ollamaBaseUrl}/api/version`) {
				return { json: async () => ({ version: '0.6.4' }) };
			}
			if (url === `${ollamaBaseUrl}/api/tags`) {
				return { json: async () => ({ models: tagsModels }) };
			}
			if (url === `${ollamaBaseUrl}/api/show`) {
				const modelId = JSON.parse(options.body ?? '{}').model as string;
				showCalls.push(modelId);
				if (modelId === 'bad-model') {
					throw new Error('simulated /api/show failure');
				}
				return {
					json: async () => ({
						template: '',
						capabilities: [],
						details: { family: 'llama' },
						remote_model: modelId,
						model_info: {
							'general.basename': modelId,
							'general.architecture': 'llama',
							'llama.context_length': 8192,
						},
					})
				};
			}
			throw new Error(`Unexpected URL in test: ${url}`);
		});

		const logService = {
			_serviceBrand: undefined,
			trace: vi.fn(),
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			show: vi.fn(),
			createSubLogger: vi.fn(),
			withExtraTarget: vi.fn(),
		};
		logService.createSubLogger.mockReturnValue(logService);
		logService.withExtraTarget.mockReturnValue(logService);

		const provider = new OllamaLMProvider(
			{
				getAPIKey: vi.fn().mockResolvedValue(undefined),
				storeAPIKey: vi.fn().mockResolvedValue(undefined),
				deleteAPIKey: vi.fn().mockResolvedValue(undefined),
				getStoredModelConfigs: vi.fn().mockResolvedValue({}),
				saveModelConfig: vi.fn().mockResolvedValue(undefined),
				removeModelConfig: vi.fn().mockResolvedValue(undefined),
			} as any,
			{ fetch } as any,
			{
				isConfigured: vi.fn().mockReturnValue(false),
				getConfig: vi.fn(),
				setConfig: vi.fn(),
			} as any,
			logService as any,
			{
				createInstance: vi.fn().mockReturnValue({}),
			} as any,
			{} as any
		);

		const tokenSource = new vscode.CancellationTokenSource();
		const models = await provider.provideLanguageModelChatInformation(
			{
				silent: false,
				configuration: { url: ollamaBaseUrl },
			},
			tokenSource.token
		);

		expect(showCalls).toEqual(['good-model-a', 'bad-model', 'good-model-b']);
		expect(models.map(model => model.id)).toEqual(['good-model-a', 'good-model-b']);
	});

	it('passes authentication headers when API key is configured', async () => {
		const ollamaBaseUrl = 'http://localhost:11434';
		const apiKey = 'test-api-key-123';
		const tagsModels = [{ model: 'test-model' }];
		const capturedHeaders: Record<string, string>[] = [];

		const fetch = vi.fn(async (url: string, options: { body?: string; headers?: Record<string, string> }) => {
			if (options.headers) {
				capturedHeaders.push(options.headers);
			}
			if (url === `${ollamaBaseUrl}/api/version`) {
				return { json: async () => ({ version: '0.6.4' }) };
			}
			if (url === `${ollamaBaseUrl}/api/tags`) {
				return { json: async () => ({ models: tagsModels }) };
			}
			if (url === `${ollamaBaseUrl}/api/show`) {
				return {
					json: async () => ({
						template: '',
						capabilities: [],
						details: { family: 'llama' },
						remote_model: 'test-model',
						model_info: {
							'general.basename': 'test-model',
							'general.architecture': 'llama',
							'llama.context_length': 8192,
						},
					})
				};
			}
			throw new Error(`Unexpected URL in test: ${url}`);
		});

		const logService = {
			_serviceBrand: undefined,
			trace: vi.fn(),
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			show: vi.fn(),
			createSubLogger: vi.fn(),
			withExtraTarget: vi.fn(),
		};
		logService.createSubLogger.mockReturnValue(logService);
		logService.withExtraTarget.mockReturnValue(logService);

		const provider = new OllamaLMProvider(
			{
				getAPIKey: vi.fn().mockResolvedValue(undefined),
				storeAPIKey: vi.fn().mockResolvedValue(undefined),
				deleteAPIKey: vi.fn().mockResolvedValue(undefined),
				getStoredModelConfigs: vi.fn().mockResolvedValue({}),
				saveModelConfig: vi.fn().mockResolvedValue(undefined),
				removeModelConfig: vi.fn().mockResolvedValue(undefined),
			} as any,
			{ fetch } as any,
			{
				isConfigured: vi.fn().mockReturnValue(false),
				getConfig: vi.fn(),
				setConfig: vi.fn(),
			} as any,
			logService as any,
			{
				createInstance: vi.fn().mockReturnValue({}),
			} as any,
			{} as any
		);

		const tokenSource = new vscode.CancellationTokenSource();
		const models = await provider.provideLanguageModelChatInformation(
			{
				silent: false,
				configuration: { url: ollamaBaseUrl, apiKey },
			},
			tokenSource.token
		);

		// Verify that models were returned correctly
		expect(models).toHaveLength(1);
		expect(models[0].id).toBe('test-model');

		// Verify that Authorization header was included in all API calls
		expect(capturedHeaders).toHaveLength(3); // version, tags, show
		capturedHeaders.forEach(headers => {
			expect(headers['Authorization']).toBe(`Bearer ${apiKey}`);
		});
	});
});
