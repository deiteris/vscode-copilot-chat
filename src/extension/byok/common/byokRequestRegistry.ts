/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VS Code never cancels the CancellationToken it passes to
 * LanguageModelChatProvider.provideLanguageModelChatResponse when the user
 * clicks Stop. This module bridges the gap: the chat participant registers its
 * own (correctly-cancelled) token here; the BYOK provider cancels whenever
 * that token fires.
 */

const _cancelFns = new Set<() => void>();

/** Called by the BYOK provider when a request starts. Returns a deregister function. */
export function registerByokCancelFn(fn: () => void): () => void {
	_cancelFns.add(fn);
	return () => _cancelFns.delete(fn);
}

/** Called by the chat participant when its requestHandler token is cancelled (user clicked Stop). */
export function cancelAllByokRequests(): void {
	for (const fn of _cancelFns) {
		fn();
	}
}
