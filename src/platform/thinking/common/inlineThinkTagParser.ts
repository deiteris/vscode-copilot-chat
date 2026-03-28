/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Segment type produced by {@link InlineThinkTagParser}.
 */
export interface ThinkTagSegment {
	readonly type: 'content' | 'thinking';
	readonly text: string;
}

const OPEN_TAG = '<think>';
const CLOSE_TAG = '</think>';

/**
 * A streaming-aware parser that splits `<think>…</think>` tags from inline
 * text into separate "thinking" and "content" segments.
 *
 * Use case: when an inference server (e.g. llama.cpp with `reasoning_format=none`)
 * embeds `<think>` blocks directly inside `delta.content` rather than providing
 * a separate `reasoning_content` field, this parser extracts them so they can
 * be routed to the thinking/reasoning UI.
 *
 * The parser is stateful — it must be fed chunks in order and will buffer
 * partial tag sequences across chunk boundaries.
 */
export class InlineThinkTagParser {
	private _insideThink = false;
	private _buffer = '';

	/**
	 * Whether the parser is currently inside an open `<think>` block.
	 */
	get isInsideThinkBlock(): boolean {
		return this._insideThink;
	}

	/**
	 * Process an incoming text chunk and return an array of tagged segments.
	 * The returned array may be empty when the parser is buffering a partial
	 * tag at the end of the chunk.
	 */
	processChunk(text: string): ThinkTagSegment[] {
		this._buffer += text;
		const results: ThinkTagSegment[] = [];

		while (this._buffer.length > 0) {
			if (this._insideThink) {
				const closeIdx = this._buffer.indexOf(CLOSE_TAG);
				if (closeIdx !== -1) {
					const thinkText = this._buffer.substring(0, closeIdx);
					if (thinkText) {
						results.push({ type: 'thinking', text: thinkText });
					}
					this._buffer = this._buffer.substring(closeIdx + CLOSE_TAG.length);
					this._insideThink = false;
				} else {
					// Check for a partial closing tag at the end of the buffer
					const partialLen = this._partialTagSuffixLength(this._buffer, CLOSE_TAG);
					if (partialLen > 0) {
						const thinkText = this._buffer.substring(0, this._buffer.length - partialLen);
						if (thinkText) {
							results.push({ type: 'thinking', text: thinkText });
						}
						this._buffer = this._buffer.substring(this._buffer.length - partialLen);
						break; // wait for more data
					} else {
						results.push({ type: 'thinking', text: this._buffer });
						this._buffer = '';
					}
				}
			} else {
				const openIdx = this._buffer.indexOf(OPEN_TAG);
				if (openIdx !== -1) {
					const contentText = this._buffer.substring(0, openIdx);
					if (contentText) {
						results.push({ type: 'content', text: contentText });
					}
					this._buffer = this._buffer.substring(openIdx + OPEN_TAG.length);
					this._insideThink = true;
				} else {
					// Check for a partial opening tag at the end of the buffer
					const partialLen = this._partialTagSuffixLength(this._buffer, OPEN_TAG);
					if (partialLen > 0) {
						const contentText = this._buffer.substring(0, this._buffer.length - partialLen);
						if (contentText) {
							results.push({ type: 'content', text: contentText });
						}
						this._buffer = this._buffer.substring(this._buffer.length - partialLen);
						break; // wait for more data
					} else {
						results.push({ type: 'content', text: this._buffer });
						this._buffer = '';
					}
				}
			}
		}

		return results;
	}

	/**
	 * Flush the internal buffer, treating any remaining buffered text
	 * (including partial tags) as literal content of the current mode.
	 * Call this when the stream ends to ensure no data is lost.
	 */
	flush(): ThinkTagSegment[] {
		if (!this._buffer) {
			return [];
		}
		const type = this._insideThink ? 'thinking' : 'content';
		const result: ThinkTagSegment[] = [{ type, text: this._buffer }];
		this._buffer = '';
		return result;
	}

	/**
	 * Returns the length of the longest suffix of `text` that is a prefix of
	 * `tag`, or 0 if no such suffix exists.
	 */
	private _partialTagSuffixLength(text: string, tag: string): number {
		const maxCheck = Math.min(tag.length - 1, text.length);
		for (let i = maxCheck; i >= 1; i--) {
			if (text.endsWith(tag.substring(0, i))) {
				return i;
			}
		}
		return 0;
	}
}
